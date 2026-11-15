# SOLO account registration and recovery

## Implementation status

**Hosted update — 28 October:** Auth admission is applied as managed version
`20261028030527`. Sequential rollback checks and six independent overlapping
database backends verified five admissions/one denial; guarded cleanup left
zero Auth counters. Chat and provider signup remain closed. Auth `site_url`
now uses `https://thesoloserviceprovider.com.au` and `password_min_length` is
12. See [the deployment record](SOLO-AUTH-ADMISSION-DEPLOYMENT-2026-10-28.md)
and [structured evidence](evidence/solo-auth-admission-hosted-2026-10-28.json).
SMTP/OTP delivery, live onboarding/recovery, signed-in browser acceptance and
cost controls remain open.

**Later 28 October update:** controlled membership operations are implemented and
verified with a hosted rollback-only grant, preserving existing records and
permissions. The form-switch cooldown explanation is also fixed. Runtime
`3c9b214` passes 291 tests and is deployed to a new protected Preview; see
[the current verification record](SOLO-MEMBER-OPERATIONS.md#committed-source-ci-and-protected-preview).
Earlier onboarding/Preview evidence below retains its original scope.

This is an additional gated implementation on `feat/solo-customer-access`, not a
public account launch. It reuses the existing Vercel API, Supabase Auth project,
login-session controller and durable admission function. The commercial website
continues to show all ten products as COMING SOON. The original implementation
changed no provider settings, memberships, billing settings or production
release switches. The later hosted Auth configuration changes are recorded above.

The new `/api/solo-onboarding` endpoint supports:

| Action | Request fields | Successful result |
| --- | --- | --- |
| `signup` | Email, password, `acceptedTerms: true` | 202, neutral `check_email` |
| `verify_email` | Email and verification code | 200, `email_verified`; no browser session |
| `request_reset` | Email | 202, neutral `check_email` |
| `reset_password` | Email, reset code and new password | 200, `password_reset`, after update and global sign-out |

GET exposes only `enabled`, `signupEnabled` and `recoveryEnabled` booleans. Every
mutation requires exact same-origin HTTPS, JSON and the existing 8,192-byte body
limit. Unexpected request fields are rejected. Passwords are 12–128 Unicode code
points, are never trimmed, and cannot be all whitespace or contain ASCII control
characters. Codes contain 6–10 decimal digits. The provider must use a code length
within that range. Terms acceptance is required by the request; this change does
not create a separate durable consent-audit record.

## Release and abuse controls

The existing customer Auth release rule must be enabled, and these independent
switches must be exactly `true` for their respective flows:

- `SOLO_CUSTOMER_SIGNUP_ENABLED`: registration and email verification.
- `SOLO_CUSTOMER_RECOVERY_ENABLED`: reset requests and password changes.

Both are absent/disabled by default. Production still requires its independent
release switch and the canonical commercial host. This work does not enable them.

All four mutations call the same `solo_admit_auth_attempt` function as password
login, before contacting Auth. Email/IP/global counter keys do not vary by action;
switching between login, signup, code verification and recovery cannot obtain a
new allowance. Storage errors, missing migration or invalid trusted Vercel IP
configuration block the action. No password, code, raw email or raw IP is stored
by that limiter. Its original fixed-window limits and no-refund policy remain.

The applied source is
`supabase/migrations/20261028010000_solo_auth_admission.sql`; the Management API
recorded it as `20261028030527 solo_auth_admission`. No additional schema change
is needed for these action types. Do not reapply it or repair history merely
to match the source filename. Hosted lock-timeout and storage-failure behavior
remain unverified despite the successful admission and concurrency checks.

Before registration, the handler reads Auth settings and requires email Auth on,
signup permitted, and automatic email confirmation off. An unexpected session
returned by signup is cleaned up and rejected instead of being issued to the
browser. A newly confirmed Supabase user still has **no SOLO membership** unless
separately provisioned through the controlled operator process. The
[membership operations workflow](SOLO-MEMBER-OPERATIONS.md) provides private,
reviewable inspect/grant/renew/block transactions for the existing schema, with
rollback as the default. Client input, user metadata, confirmation and password
reset cannot enable chat or change quotas. Automated subscription entitlements
remain unfinished; the operator workflow does not approve customers by itself.

## Email verification and password reset

This flow uses codes entered into the website, rather than credentials in URLs
or browser storage. The prepared email templates use Supabase's `{{ .Token }}`:

- `supabase/templates/solo-confirm-email.html`
- `supabase/templates/solo-reset-password.html`

They retain the approved business emblem and palette. They are **prepared files,
not installed or delivery-tested templates**. Their ordinary site links contain
no credentials. No callback consumes a code on GET, and no token hash, access
token or refresh token is accepted from a query string, fragment or form.

The hosted configuration still has default link templates without `{{.Token}}`
and no custom SMTP fields. Existing commercial DNS points to Namecheap Private
Email; mailbox access, SMTP authentication and delivery remain unverified.
Configure that existing service and install the committed templates before
opening signup. The observed eight-digit OTP setting fits the implemented
code-length validation.

Verification uses `POST /auth/v1/verify` with the purpose-specific `signup` or
`recovery` type. This matters because GoTrue's generic `email` type can validate
multiple email-token purposes. The resulting temporary session remains inside
the server request. The shared verifier checks the exact access token online,
then binds JWT subject, issuer and session ID to that user. Actual online
`email_confirmed_at` and a usable matching email are required; user metadata or
generic phone confirmation cannot substitute for them.

Email verification revokes its temporary session before reporting success. It
does not sign the customer in, create browser cookies, or activate a membership.

Password reset verifies a recovery code, updates the password with that temporary
session, then requests global logout. The handler only reports full success after
both operations succeed. Existing SOLO cookie slots are cleared and the browser
notifies other tabs using the existing fixed account-change signal; no identity,
password, code or token is broadcast.

OTP verification consumes the code before the password update. If a later step
fails, the response distinguishes these outcomes:

- `reset_incomplete`: the code was checked, but the password change cannot be
  confirmed. Request a new code; do not automatically retry the consumed one.
- `reset_signout_unconfirmed` with `passwordChanged: true`: the password update
  succeeded, but global sign-out could not be confirmed. The UI tells the
  customer to contact support before continuing.

Local cookie removal is never presented as proof of remote revocation. Failed
operations attempt to revoke any temporary recovery session without exposing it.
The current Supabase source revokes other sessions when updating the password;
the explicit global logout also removes the current recovery session. These
provider assumptions still require hosted acceptance against this project.

## Customer interface

The existing approved SOLO page receives a separate account-help panel with
registration, verification and recovery forms. Controls remain hidden until the
server returns explicit true capabilities. Each input has a visible label and
appropriate autocomplete, numeric input mode or password semantics. Status
updates use a live region and plain text; provider HTML is never rendered.

Passwords and codes clear as soon as the user submits, including while the
network is stalled. The controller never stores credentials in localStorage,
sessionStorage or URLs. Rate limits use bounded Retry-After values; no automatic
signup, mail send, code verification or password-reset retry occurs.

## Verification and remaining release work

The endpoint has an independent 26-test mocked transport suite. It covers closed
gates, CSRF, request validation, shared admission, confirmation configuration,
purpose-specific verification, matching identity, temporary-session cleanup,
neutral account-existence responses and honest partial-reset outcomes. Two guard
defects were reproduced during review and fixed: whitespace in configured keys
and HTTP 5xx errors incorrectly disguised by account-existence error codes.

The shared identity verifier also has five new regression groups. Four failed
against the previous source; the old code let an unconfirmed mocked customer
reach chat. The revised tests verify rejection before quota admission or model
access. Existing valid customer fixtures now include an actual confirmed-email
timestamp rather than relying on incomplete identity fixtures.

Local/browser-controller tests use dummy credentials and mocked transports.
They do **not** establish email delivery, live signup, hosted password recovery,
signed-in browser behavior or actual Samsung acceptance. A local real-browser
attempt was blocked because the available Chromium download was not a valid ZIP;
no browser screenshots or mobile-layout result are claimed for these new forms.

Final local JavaScript verification: **246 tests passed across 12 files, zero
failures or skips**. The new UI suite has 29 cases, including account/identity
changes invalidating pending form results, clearing earlier email/password/code
values, preserving the current reset outcome, and one fixed cross-tab notification
through the existing account controller. Existing account and conversation suites
pass 30 and 26 cases respectively.

### GitHub and protected Preview evidence

- Runtime source: `8c50cf7abe02731a0bcfa83c63c7cd27f7cd8ba2` in draft PR #34.
- [CI 40545518920](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40545518920)
  passed **246 JavaScript + 30 SQL = 276 tests**, zero failures or skips. Both
  actual job logs were inspected, not just their overall green status. Repository
  quality [40545518713](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40545518713)
  also passed.
- Protected Preview `dpl_8v9c8Y1DBmxJn9HCtctawJxBrkef` is READY at that runtime
  source: [SOLO preview](https://solo-provider-industrial-c9i4u7aj9-wrightwayz.vercel.app/solo-ai.html#conversation).
- Five deployed HTML/CSS/JavaScript files returned HTTP 200 and match source
  byte-for-byte. Twelve actual API checks passed: all onboarding actions remain
  disabled, missing/cross-origin mutations are rejected, method restrictions
  hold, existing account status remains disabled, same-origin logout clears both
  cookie slots, and customer chat remains closed.
- [Sanitized HTTP/source evidence](evidence/solo-onboarding-preview-2026-10-28.json)
  contains hashes and exact result scope. The temporary preview share was revoked
  after verification; the returned protection-bypass map is empty. No claim is
  made that already cached cookies were independently tested for invalidation.
- Fresh Vercel alias inspection confirms the live commercial website still uses
  `dpl_7Bg2jvu7yKdHk5mfa8GqCHKrD3Nt`. No production cutover occurred in this cycle.

These are closed-gate HTTP checks. They do not replace a real new-account email,
OTP/password reset or signed-in customer conversation test.

Before customer activation:

1. Configure the existing commercial SMTP service and verified sender, install
   the committed confirmation/recovery OTP templates, and prove delivery with
   an authorized test address. The canonical Auth site URL and 12-character
   minimum are already verified; prepared templates alone do not configure
   Supabase. Keep signup closed until email acceptance is complete.
2. Complete the remaining hosted Auth-admission lock-timeout and storage-failure
   checks without repeating the already verified migration and quota race.
3. Keep email confirmation required. Verify a new account, duplicate registration,
   invalid/expired codes, password reset, password-change failure and global
   session revocation against the hosted Auth service.
4. Use the reviewed controlled membership workflow only for specifically approved
   customers after production provider cost controls are established. Complete
   operational monitoring and remaining signed-in desktop/Samsung acceptance.
5. Enable production customer access only after those gates pass. Earlier private
   Gemini responses and this gated implementation do not prove a public product.

## Primary references checked

- [Supabase changelog](https://supabase.com/changelog): current Auth/SMTP changes
  were reviewed. New Free projects using default SMTP cannot customize templates;
  custom SMTP is a prerequisite where that restriction applies.
- [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Auth verification implementation](https://github.com/supabase/auth/blob/master/internal/api/verify.go)
- [Password update implementation](https://github.com/supabase/auth/blob/master/internal/models/user.go)
- [Global/local logout implementation](https://github.com/supabase/auth/blob/master/internal/api/logout.go)

The authoritative current release checklist is
[issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31).

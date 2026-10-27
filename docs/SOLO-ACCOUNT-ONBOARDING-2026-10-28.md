# SOLO account registration and recovery

## Implementation status

This is an additional gated implementation on `feat/solo-customer-access`, not a
public account launch. It reuses the existing Vercel API, Supabase Auth project,
login-session controller and durable admission function. The commercial website
continues to show all ten products as COMING SOON. No provider settings,
memberships, billing settings or production release switches are changed.

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

The pending migration is still
`supabase/migrations/20261028010000_solo_auth_admission.sql`. No additional schema
change is needed for these action types. Its hosted application remains blocked;
see [the connector investigation](SOLO-MIGRATION-CONNECTOR-BLOCKER-2026-10-28.md).

Before registration, the handler reads Auth settings and requires email Auth on,
signup permitted, and automatic email confirmation off. An unexpected session
returned by signup is cleaned up and rejected instead of being issued to the
browser. A newly confirmed Supabase user still has **no SOLO membership** unless
separately provisioned through the controlled operator process. Client input,
user metadata, confirmation and password reset cannot enable chat or change
quotas. Automated membership provisioning remains unfinished.

## Email verification and password reset

This flow uses codes entered into the website, rather than credentials in URLs
or browser storage. The prepared email templates use Supabase's `{{ .Token }}`:

- `supabase/templates/solo-confirm-email.html`
- `supabase/templates/solo-reset-password.html`

They retain the approved business emblem and palette. They are **prepared files,
not installed or delivery-tested templates**. Their ordinary site links contain
no credentials. No callback consumes a code on GET, and no token hash, access
token or refresh token is accepted from a query string, fragment or form.

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
pass 30 and 26 cases respectively. GitHub CI and hosted deployment evidence must
be recorded separately; this local count does not establish either.

Before customer activation:

1. Restore the connector's supported migration write path, apply the saved Auth
   admission migration once, and verify hosted privileges/concurrency/failures.
2. Inspect and configure the existing commercial SMTP service, verified sender,
   email templates and canonical Auth URLs; prove delivery with an authorized
   test address. The prepared templates alone do not configure Supabase.
3. Keep email confirmation required. Verify a new account, duplicate registration,
   invalid/expired codes, password reset, password-change failure and global
   session revocation against the hosted Auth service.
4. Complete controlled membership provisioning, production provider cost controls,
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

# SOLO production access preparation

**Current hosted status — 28 October:** Auth admission is applied as managed
version `20261028030527`. Hosted sequential rollback and concurrency across six
independent backends passed (five admissions/one denial); cleanup left zero Auth
counters. Customer chat, the SQL policy and provider signup remain closed.
Auth `site_url` is `https://thesoloserviceprovider.com.au` and
`password_min_length` is 12. See [the deployment record](SOLO-AUTH-ADMISSION-DEPLOYMENT-2026-10-28.md)
and [structured evidence](evidence/solo-auth-admission-hosted-2026-10-28.json).
Existing SMTP configuration, OTP template installation, delivery/recovery,
signed-in browser and cost acceptance remain prerequisites. Hosted lock-timeout
and storage-failure checks remain unverified. The original execution outcome at
the end of this document is preserved as history.

**Later same-day update:** gated signup, email verification and password recovery
are now implemented separately. See [the account implementation](SOLO-ACCOUNT-ONBOARDING-2026-10-28.md)
for their current scope. The 214-test and migration-blocker evidence below is the
original production-gate milestone; it is not a new hosted onboarding result.

This change prepares the existing commercial API for production activation after
the remaining account, usage and spending requirements have been verified. It does not enable accounts or inference, provision accounts,
change billing, or replace the existing Vercel, Supabase or Gemini services.
Website publication and customer AI activation remain separate operations.

## Release switches

`powerhouse-website/lib/solo-release-policy.cjs` owns the shared deployment rule.

| Deployment | Requirement for customer access |
| --- | --- |
| Preview | `VERCEL_ENV=preview` and the relevant existing feature switch is exactly `true` |
| Production | `VERCEL_ENV=production`, the new `SOLO_CUSTOMER_PRODUCTION_ENABLED` is exactly `true`, the request uses the canonical commercial host, and the relevant feature switch is exactly `true` |
| Other or unset | Customer access stays disabled |

The independent feature switches are `SOLO_CUSTOMER_AUTH_ENABLED` for login,
status and refresh, and `SOLO_CUSTOMER_CHAT_ENABLED` for customer inference.
Existing Preview switches alone cannot activate Production. The new production
switch defaults disabled when absent. This implementation sets no environment
variable to `true`.

The canonical production host is `thesoloserviceprovider.com.au`. A supplied
Origin must be exactly `https://thesoloserviceprovider.com.au`, with no alternate
host, HTTP scheme or path. Explicit Bearer chat clients may omit Origin; cookie
chat still requires the exact HTTPS Origin and verified `expectedUserId` binding.
Account mutations retain their existing same-origin CSRF checks. Production
requests marked `Sec-Fetch-Site: cross-site` cannot gain customer access.

Enabling the release switch does not bypass online identity verification, live
session/membership checks, atomic chat admission, provider restrictions or
completion accounting. Private owner-token inference is now always rejected in
Production, regardless of the private-testing switch or a valid owner token.

## Sign-out while access is disabled

`POST /api/solo-auth` with `{"action":"logout"}` remains available for same-origin
session cleanup when the release or Auth switches are disabled. It does not
create membership or grant chat access, and does not require active membership.

- Existing access credentials are sent only to the configured Auth logout endpoint.
- An existing refresh credential is rotated only when needed to revoke that session.
- With no credentials, local cookies are cleared without contacting Auth.
- Successful sign-out reports the actual enabled state, rather than enabling the UI.
- If revocation fails, local cookies are still cleared and the API returns an error
  saying server sign-out could not be confirmed. Local cookie removal does not prove
  remote revocation.
- Cross-origin or missing-Origin mutations are rejected before clearing cookies or
  contacting Auth. Normal JSON shape and body limits still apply.

This cleanup exception also allows a same-origin session on a previously used
deployment host to be revoked. It does not make that host eligible for production
login, status or inference.

## Durable login admission dependency

The login handler uses the server-only `solo-auth-admission.cjs` adapter before
the Supabase password grant. The adapter calls the service-role-only
`solo_admit_auth_attempt` RPC. Source
`supabase/migrations/20261028010000_solo_auth_admission.sql` is now applied as
managed history version `20261028030527`; do not reapply it to match its filename.
An absent/unavailable RPC or invalid admission configuration must return an error
before a password grant or new session is requested. There is no bypass switch.

Admission uses the existing `SOLO_USAGE_HASH_SECRET` to derive separate keyed
email and IP fingerprints. The existing `SOLO_SUPABASE_SECRET_KEY` authorizes the
RPC and is not exposed to the browser. No raw email, IP address or password is
stored by the limiter. Only Vercel's trusted `x-vercel-forwarded-for` address is
accepted on a Vercel Preview/Production deployment; arbitrary forwarded-header or
socket fallbacks are not accepted.

Login admission limits are independent of the existing customer inference quotas.
Status, refresh and logout do not consume login allowance. Admission denial or
storage failure prevents password verification and cookie issuance; a rate-limit
response supplies a bounded `Retry-After` value.

## Deployment order

1. Review the source, new migration and targeted automated results. Keep all
   customer feature switches and the production release switch disabled.
2. The commercial Auth admission migration, runtime/client permission boundaries,
   sequential admission and hosted concurrency are verified. Preserve this
   completed dependency; verify remaining hosted lock/storage-failure behavior
   without model calls.
3. Configure the existing commercial server variables for the intended deployment
   environment through authorized secret-management controls. Do not retrieve or
   print credential values, or copy any WrightWayz resources.
4. Complete the outstanding account-delivery, spending and signed-in website
   acceptance requirements below before enabling production customer access.
5. Enable the explicit production release and feature switches only after those
   requirements pass. The database inference policy and eligible memberships are
   additional independent prerequisites; this code change does not enable them.

Migration deployment now has separate hosted evidence; local tests alone would
not establish it. Production activation remains incomplete. A Ready deployment
alone does not establish working customer AI.

## Verification scope

The release/logout regressions were exercised against the previous handlers
before implementation: nine regression cases failed, including disabled sign-out and
owner-token inference in Production. Two further regressions demonstrated the
missing login-admission hook before that integration.

The focused handler integration checks pass locally:

| Test file | Result |
| --- | --- |
| `powerhouse-website/tests/solo-auth.test.cjs` | 31 passed |
| `powerhouse-website/tests/solo-chat.test.cjs` | 42 passed |
| `powerhouse-website/tests/solo-customer-access.test.cjs` | 25 passed |
| Total | 98 passed, zero failures or skips |

The Auth suite includes the actual default admission adapter with a mocked RPC:
an admitted attempt reaches the password grant, while a denied attempt returns
429 and its bounded delay without contacting Auth or issuing cookies. The new
adapter/migration have separate tests and require separate hosted deployment
evidence. All local tests use dummy credentials and mocked network responses;
they do not send Auth requests or call Gemini. Full CI and deployed evidence
must be recorded separately before reporting a successful release.

## Remaining external release requirements

- Verify a zero-charge Gemini entitlement or obtain an explicit spending ceiling
  and complete the corresponding durable cost controls. Request caps alone are
  not a currency budget. This preparation does not approve spending.
- Complete hosted acceptance of the existing gated code-entry onboarding and
  recovery flow. Paid subscription entitlements remain unfinished. Keep provider
  signup closed until delivery, account/session outcomes and abuse controls pass.
- Configure the existing commercial SMTP service and verified sender, install
  the committed confirmation/recovery OTP templates, and verify delivery. The
  canonical Auth site URL and 12-character minimum are already corrected and
  verified; current hosted templates still use links instead of the required
  OTP text. A replacement email provider has not been shown to be necessary.
- Complete actual signed-in browser, live session-change/cross-tab and mobile
  acceptance using supported secure credential entry. Earlier API verification
  and mocked UI tests do not replace this evidence.
- Complete remaining real provider-error/timeout and completion-storage failure
  verification, plus operational monitoring and reviewed retention procedures.

Earlier hosted Auth, quota races and captured two-turn Gemini verification remain
valid evidence of their recorded Preview tests and were not repeated for this
source preparation. See `SOLO-API-LAUNCH-GATES.md` and issue #31 for the release
checklist.

## Execution outcome — 28 October 2026, Brisbane

All ten JavaScript files were executed directly: **184 tests passed**. The
two SQL suites executed **30 tests** (21 existing chat quota tests and nine new
Auth admission tests). Total: **214 tests; zero failures**. The SQL package test
command now includes both migration suites. Local network boundaries use mocks;
PGlite serializes its connection, so it does not establish hosted concurrency.

The commercial project was reinspected: `ACTIVE_HEALTHY`, managed service role
has `BYPASSRLS` and schema `USAGE`, and chat policy remains disabled. Two calls
to the connector's `apply_migration` operation returned
`McpServerError: Invalid or expired requestState`. Subsequent SQL inspection
confirmed neither new Auth table nor RPC exists; migration history still has
only the earlier customer-admission migration. **The new migration is not applied.**
No customer flag, membership, Auth signup setting or billing configuration was
changed. No new Auth account, email or model call was made.

This is a connector write failure, not a failed SQL migration or proof that the
new live limiter works. Preserve the reviewed migration and restore an authorized
write path before applying it once and running hosted admission checks.

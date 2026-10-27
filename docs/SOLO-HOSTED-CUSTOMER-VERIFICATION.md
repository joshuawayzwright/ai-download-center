# Hosted customer verification harness

This is an **opt-in verification tool, not hosted evidence yet**. The harness is
`powerhouse-website/scripts/solo-customer-hosted-smoke.cjs`; its nine local tests
use simulated services. No new CI workflow or automatic deployment hook runs it.

It is restricted to an immutable `solo-provider-industrial-…-wrightwayz.vercel.app`
Preview and the existing commercial Supabase project `tymayhazawkofmiypeqt`.
It never calls `/api/solo-chat`, Gemini, signup, invitations, password resets or
Auth administration. It never edits policy, membership, environment variables or
schema. Test credentials and cookies stay in memory and are not printed.

## Prerequisites controlled by the operator

1. Inspect and apply the existing migration to the commercial project. Verify
   managed `auth.sessions` columns, service-role RPC access, client-role denial,
   RLS and security advisors. Keep unrestricted signup disabled.
2. Prepare controlled, disposable password test identities without sending mail.
   Record their actual user UUIDs; do not substitute existing customer accounts.
   Explicitly allowlist those UUIDs with short membership expiry. The harness
   logs them out, including refresh rotation and revocation tests.
3. Configure the existing server-side Supabase variables in **Preview only**.
   Set `SOLO_CUSTOMER_AUTH_ENABLED=true` while leaving
   `SOLO_CUSTOMER_CHAT_ENABLED=false`. Public/production gates stay off.
   The harness aborts if a signed-in response reports customer chat enabled.
4. Enable the SQL policy for a bounded verification window with reviewed small
   caps and no unrelated customer traffic. The harness cannot change these caps.
5. Supply credentials to an isolated server process through a secure environment
   channel. Do not paste values into shell history, chat, source, issue comments
   or build logs. A protected Preview needs an existing Vercel share URL.

Supabase documents server-only admin user creation and `email_confirm: true` at
[Auth createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser).
The harness itself neither creates users nor sends messages.

## Runner environment

| Variable | Required value or purpose |
| --- | --- |
| `VERCEL_ENV` | `preview` |
| `SOLO_CUSTOMER_HOSTED_CHECK` | Explicit `true`; absent by default |
| `SOLO_CUSTOMER_SMOKE_MODE` | `auth` or `race` |
| `SOLO_CUSTOMER_SMOKE_TARGET_URL` | Immutable SOLO Preview URL, optionally its `_vercel_share` parameter |
| `SOLO_SUPABASE_URL` | `https://tymayhazawkofmiypeqt.supabase.co` |
| `SOLO_SUPABASE_SECRET_KEY` | Existing modern server-only secret; sent to Supabase in `apikey` only |
| `SOLO_CUSTOMER_SMOKE_IDENTITIES` | Sensitive JSON array of controlled test identities, as below |
| `SOLO_CUSTOMER_SMOKE_SCENARIO` | Race mode only: `duplicate`, `user_minute`, `user_daily`, `global_minute`, `global_daily` |
| `SOLO_CUSTOMER_SMOKE_EXPECTED_ADMISSIONS` | Exact positive expected count for the prepared race; must be smaller than the number of attempts |
| `SOLO_CUSTOMER_SMOKE_ATTEMPTS_PER_USER` | Race mode only; default 4, bounded 2–6 |

The identity shape is `{testOnly:true,userId,email,password}`. Use one identity
for `auth`, duplicate or user-limit scenarios; use two distinct identities for
global-limit scenarios. Passwords must be 16–1024 characters. Do not save a real
identity JSON example in the repository.

After the environment has been securely prepared:

```sh
node powerhouse-website/scripts/solo-customer-hosted-smoke.cjs
```

## What each mode proves when actually run

`auth` checks seven outcomes: real login and Secure/HttpOnly/SameSite=Strict
host-only cookies; live account status without quota debit; refresh credential
rotation without a new session or debit; remote logout and cookie clearing;
rejection of the still-unexpired old JWT by the application and live database
session check; rejection of a revoked-session admission; and session cleanup.
It does not consume allowance when the implementation is correct.

`race` signs in the controlled identities, then starts all admission requests
together using `https.request` with `agent:false`. Each request has a separate
TLS socket; the runner checks distinct observed socket objects. This exercises
independent hosted HTTP requests and PostgREST transactions. Database lock
serialization is expected. It does not claim to measure a precise overlap of
internal SQL statements or transaction isolation modes.

The race must return the **exact** expected admission count and the exact
scenario denial code. Duplicate mode reuses one request UUID/fingerprint across
the burst, expects one admission, then checks a changed fingerprint returns
`request_conflict`. Other modes use unique UUIDs. Final account status must show
exactly the admitted allowance decrement for each user, after which sessions are
logged out. Any timeout or malformed result fails the run; there is no retry of
an uncertain admission.

Admission-only checks intentionally leave `reserved` ledger rows. They count
toward quotas and remain available for audit. The harness does not fabricate a
Gemini outcome, refund, delete or prune them. The planned request UUIDs are
printed before dispatch, so even a failed burst can be inspected safely.

## Preparing quota scenarios

Run `auth` first. Run each race separately after the operator inspects existing
usage and prepares the policy. Keep other limits above the burst's expected
usage so the intended limit is tested; otherwise a different denial code makes
the run fail. Never delete existing ledger rows to create room.

| Scenario | Suggested new admissions | Prepared boundary |
| --- | ---: | --- |
| `duplicate` | 1 | At least one slot under every cap |
| `user_daily` | 2 | User day cap = current user day count + 2 |
| `user_minute` | 2 | User minute cap = current rolling minute count + 2 |
| `global_daily` | 3 | Global day cap = current global day count + 3; two users |
| `global_minute` | 3 | Global minute cap = current global rolling minute count + 3; two users |

Use a clear rolling-minute window for minute scenarios; admissions aging out
during a run can invalidate a prepared count. Avoid UTC midnight for day
scenarios. Root/operator verifies the actual ledger rows, cap values and grants
after each run. Restore the SQL policy to disabled, block or expire the test
members and disable the Preview Auth gate after the verification window.

This harness supplies **Auth and hosted database evidence only**. A separately
authorized, bounded customer-authenticated Gemini conversation, provider-error
accounting, the real browser experience, Samsung layout acceptance and public
release approval remain separate gates.

## Documented secret-configuration capability

The connected Supabase tool set inspected on 27 October 2026 exposes publishable
keys and project URLs, but no server-secret retrieval, creation or secure transfer
operation. SQL and Edge Functions must not be used to extract hidden credentials.

[Supabase's Vercel Marketplace documentation](https://supabase.com/docs/guides/integrations/vercel-marketplace)
describes automatic `SUPABASE_SECRET_KEY` environment synchronization for
Marketplace-created projects and unified Vercel billing. That does not establish
an available connector operation for this existing standalone commercial
project. Do not create another project or change its billing to obtain a key.
The existing project's documented API-key dashboard/authorized Management API
or an already configured integration is the appropriate separate setup route;
keep its values out of user-visible output.

## Local harness verification

```sh
node powerhouse-website/tests/solo-customer-hosted-smoke.test.cjs
```

The nine tests cover destination/opt-in guards, session sequencing and cleanup,
revocation failure detection, secret-free output, cross-origin redirect refusal,
parallel request scheduling, exact race outcomes, persistent allowance checks,
bounded scenarios and rejection of shared-connection evidence. Mock success is
explicitly labelled `hostedTransport:false`; it is not a hosted pass.

# Hosted customer verification harness

The Auth/race harness has **passed actual hosted authentication and all five
admission race scenarios**. A separate actual customer API check returned 429
before inference, and final cleanup is verified. See
[the live verification record](SOLO-CUSTOMER-LIVE-VERIFICATION-2026-10-27.md).
That Auth/quota cycle made zero provider calls. A separate
[customer Gemini verification](SOLO-CUSTOMER-GEMINI-VERIFICATION-2026-10-27.md)
now verifies two captured customer replies, context recall and durable success
finalization; four provider calls were counted across its two windows. Real
provider-error/timeout and finalization-failure accounting remain unverified.
The Auth/race harness is
`powerhouse-website/scripts/solo-customer-hosted-smoke.cjs`; its nine local tests
use simulated services. No new CI workflow or automatic deployment hook runs it.

It is restricted to an immutable `solo-provider-industrial-…-wrightwayz.vercel.app`
Preview and the existing commercial Supabase project `tymayhazawkofmiypeqt`.
It never calls `/api/solo-chat`, Gemini, signup, invitations, password resets or
Auth administration. It never edits policy, membership, environment variables or
schema. Test credentials and cookies stay in memory and are not printed.

Current source is `f4ba7c22e6976c127aefb55a1c0479686cad16f0`; runtime implementation
is unchanged at `0af8d9c263a1653128786061f3ffacea99b36894`.
[CI run 40478171099](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40478171099)
passed **137 API/browser/smoke + 21 SQL = 158 tests**, zero failures/skips;
[quality run 40478171124](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40478171124)
passed. That existing 158-test baseline was not rerun for the Gemini cycle.
Final normal Preview `dpl_Fciqz77hEPSAg1FQ59UTcX13n9yM` is **READY** at `f4ba7c2`:
[current SOLO Preview](https://solo-provider-industrial-qoyn70gb8-wrightwayz.vercel.app/solo-ai.html#conversation).
Both customer flags and the SQL policy are disabled; both test members are
blocked/expired, sessions are zero, and 15 rows remain: the 11 prior admission-only
reservations and four succeeded Gemini requests. The final normal Preview's
three disabled HTTP checks passed. The prior Auth/quota cycle's 11-row cleanup
and zero-call evidence remain historical facts in its original record.

## Earlier read-only configuration probe — hosted access verified

The existing commercial server key is saved as sensitive
`SOLO_SUPABASE_SECRET_KEY` in Vercel Preview. **Its hosted status-RPC access is
verified.** The separate probe is
`powerhouse-website/scripts/solo-customer-config-smoke.cjs`.

At commit [`415cc0df3217c4e0cec83e390122e6af99bfcf4b`](https://github.com/joshuawayzwright/ai-download-center/commit/415cc0df3217c4e0cec83e390122e6af99bfcf4b),
scoped diagnostic deployment `dpl_Ght3B9TdBX37zQyHAKWvxm3tmGnR` reached **READY**
and logged `SOLO_COMMERCIAL_SERVER_KEY_PASS`. That pass requires a live RPC
HTTP **200** and the existing adapter's expected **503 `disabled`** result.
The logged settings were `disable_signup:false`, `email:true`, `anonymous:false`
and `mailer_autoconfirm:false`. A separate actual Auth settings GET also
confirmed `external.anonymous_users:false`. Fresh SQL inspection retained
**policy disabled, zero members and zero ledger rows**.

The earlier normal deployment `dpl_B1YYM8g9s9TfoLHGJtFw5ZLr2bCm` was **READY** at that
same commit: [SOLO preview](https://solo-provider-industrial-8ig3nmuwt-wrightwayz.vercel.app/solo-ai.html#conversation).
It used no build override and logs confirm no probe ran. Actual HTTP checks
returned account GET **200** with all three status booleans false and
private/no-store caching, refresh POST **503 `auth_disabled`**, and dummy
customer Bearer chat POST **503 `customer_disabled`**; marker
`SOLO_CUSTOMER_CONFIG_DISABLED_PASS`. Sanitized results are recorded in
[server-key evidence](evidence/solo-server-key-2026-10-27.json).

[CI run 40476932755](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40476932755)
passed **132 API/browser/smoke + 21 SQL = 153 tests**, zero failures or skipped
tests; [repository quality run 40476932720](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40476932720)
also passed. The five probe tests use mocks. These earlier hosted results prove
server access and closed gates only. Later login and quota-race evidence is
recorded separately in the live verification record.

Run it in a scoped server-side Preview build with the existing commercial
`SOLO_SUPABASE_URL`, modern `SOLO_SUPABASE_SECRET_KEY` and
`SOLO_SUPABASE_PUBLISHABLE_KEY`. It requires `VERCEL_ENV=preview`, both
`SOLO_CUSTOMER_AUTH_ENABLED=false` and `SOLO_CUSTOMER_CHAT_ENABLED=false`, and
explicit opt-in. Keep the hosted SQL policy disabled. With those variables
securely supplied, run from the repository root:

```sh
SOLO_CUSTOMER_CONFIG_CHECK=true node powerhouse-website/scripts/solo-customer-config-smoke.cjs
```

The probe calls only the existing commercial `solo_customer_status` RPC and
Auth settings endpoint. It requires an actual HTTP 200 from the RPC and the
expected disabled-policy result, using random user/session UUIDs and the server
key in `apikey` only. It then reads Auth settings using the publishable key.
It creates no accounts or sessions, changes no database/configuration state,
reserves no allowance and calls no AI provider.

On a real pass it prints `SOLO_COMMERCIAL_SERVER_KEY_PASS` plus the validated
boolean settings `disable_signup`, `email`, `anonymous` and
`mailer_autoconfirm`. Credentials, raw service bodies and raw exceptions are
never printed. The marker establishes server-key access and observed settings
only; it does not require signup to be disabled. The later actual Auth settings
GET verified `disable_signup=true` before the controlled pilot. Keep signup
disabled. Customer-authenticated Gemini replies and successful finalization are
now verified separately; real provider-error/timeout and finalization-failure
accounting remain open.

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

This harness supplies **Auth and hosted database evidence only**. The separate
[customer Gemini record](SOLO-CUSTOMER-GEMINI-VERIFICATION-2026-10-27.md) verifies
successful generation and durable completion. Real provider-error accounting,
the customer browser experience, Samsung layout acceptance and public release
approval remain separate open gates.

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

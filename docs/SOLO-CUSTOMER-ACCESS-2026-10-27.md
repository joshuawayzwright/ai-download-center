# SOLO customer access — 27 October 2026

## Recorded customer access and Gemini milestones

This record covers the customer access implementation through the captured
Gemini verification cycle. Later account-binding changes and their separate
browser evidence are recorded in
[browser isolation](SOLO-BROWSER-ISOLATION-2026-10-27.md); the historical source,
deployment and test totals below are not pointers to the latest release.

Customer login, secure session handling, durable request admission and the web
account panel are implemented for a Preview-only pilot. The existing commercial
Supabase project is now accessible and its admission migration has been applied
and checked on the hosted database. **Live customer login/session controls, all
five hosted admission races and actual API quota rejection are verified.**
Two captured customer-authenticated Gemini turns now also verify context recall,
quota decrement and successful durable finalization. Real provider-error/timeout
and finalization-failure behavior, customer website/mobile acceptance and public
release remain unverified.

The sensitive Vercel Preview Supabase secret key now has **verified hosted
server RPC access** through the read-only configuration probe. Actual Auth
settings confirm unrestricted signup is disabled. The test window is closed:
both customer Preview flags and the hosted SQL policy are disabled, both test
memberships are blocked/expired, and 15 ledger rows remain intact: 11 earlier
admission-only reservations and four succeeded Gemini requests.
Production remains the existing maintenance deployment; public inference stays off.

The previous owner-token Gemini two-turn HTTP result remains recorded in
[the private API verification](SOLO-PRIVATE-CHAT-VERIFICATION-2026-10-27.md).
This work extends that same `/api/solo-chat`; it does not create another AI backend.

The authoritative current commits, preview deployment, test totals and remaining
release gates are recorded in
[issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31).

## GitHub and deployed evidence

- Gemini-cycle verified source: [`f4ba7c22e6976c127aefb55a1c0479686cad16f0`](https://github.com/joshuawayzwright/ai-download-center/commit/f4ba7c22e6976c127aefb55a1c0479686cad16f0), with runtime implementation unchanged during that cycle at `0af8d9c`. The [customer Gemini record](SOLO-CUSTOMER-GEMINI-VERIFICATION-2026-10-27.md) verifies two captured HTTP 200 turns, exact context recall, allowance **2 → 1 → 0**, logout 200 and two matching succeeded SQL rows. Marker: `SOLO_CUSTOMER_GEMINI_TWO_TURN_PASS`.
- Four actual Gemini requests were made across two bounded windows. The first two have durable success records but lost client output; no HTTP/context assertions are claimed for that attempt. All four successes and the prior 11 reservations are retained.
- Existing CI baseline: [run 40478171099](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40478171099) at `0af8d9c` passed **137 API/browser/smoke + 21 SQL = 158 tests**, zero failures/skips; jobs `122101471635` and `122101471320`. [Repository quality run 40478171124](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40478171124) also passed. No runtime changes or new test run are claimed for this Gemini cycle.
- Gemini-cycle final normal protected Preview: `dpl_Fciqz77hEPSAg1FQ59UTcX13n9yM`, **READY** at `f4ba7c2`: [SOLO preview](https://solo-provider-industrial-qoyn70gb8-wrightwayz.vercel.app/solo-ai.html#conversation). No build override. Actual HTTP checks returned account GET **200**, all three status booleans false and private/no-store caching; refresh **503 `auth_disabled`**; customer chat **503 `customer_disabled`**. Marker: `SOLO_CUSTOMER_CONFIG_DISABLED_PASS`.
- Final SQL state: disabled policy, restored caps **3/20/20/200**, two blocked/expired members with zero eligible, zero sessions, and 15 retained rows: 11 admission-only reservations plus four Gemini successes. Production remains `dpl_9KijhLqwcEABqisC59RiLYJgyeV8`.

Earlier Auth/quota cycle:

- The [live Auth/quota verification record](SOLO-CUSTOMER-LIVE-VERIFICATION-2026-10-27.md) at `0af8d9c` preserves the actual Auth, five race scenarios, API 429 and cleanup evidence. That cycle made **zero AI provider calls**, retained 11 reserved rows and ended with normal Preview `dpl_BDfkTt3NR4rJwy9XoBT9tJwsLnx8`. Its completed evidence has not been replaced by the later Gemini check.

Earlier server-key configuration evidence:

- Configuration probe: [`415cc0df3217c4e0cec83e390122e6af99bfcf4b`](https://github.com/joshuawayzwright/ai-download-center/commit/415cc0df3217c4e0cec83e390122e6af99bfcf4b).
- Earlier CI: [run 40476932755](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40476932755) passed **132 API/browser/smoke tests + 21 SQL tests = 153**, zero failures or skipped tests; jobs `122097356611` and `122097356702`. [Repository quality run 40476932720](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40476932720) also passed.
- Scoped diagnostic deployment `dpl_Ght3B9TdBX37zQyHAKWvxm3tmGnR` was **READY** at that commit. Its logs contain `SOLO_COMMERCIAL_SERVER_KEY_PASS`, which requires actual RPC HTTP **200** followed by the existing adapter's expected **503 `disabled`** result. Auth settings were `disable_signup:false`, `email:true`, `anonymous:false`, `mailer_autoconfirm:false`.
- Earlier normal protected Preview: `dpl_B1YYM8g9s9TfoLHGJtFw5ZLr2bCm`, **READY** at the same commit: [SOLO preview](https://solo-provider-industrial-8ig3nmuwt-wrightwayz.vercel.app/solo-ai.html#conversation). No build override was used and build logs confirm the probe did not run.
- Actual HTTP checks on that normal deployment passed: account GET **200**, `enabled:false`, `authenticated:false`, `chatEnabled:false`, private/no-store caching; refresh POST **503 `auth_disabled`**; dummy customer Bearer chat POST **503 `customer_disabled`**. Marker: `SOLO_CUSTOMER_CONFIG_DISABLED_PASS`.
- Fresh SQL inspection after the probe confirmed **policy disabled, zero members, zero ledger rows**. The sanitized [server-key and deployment evidence](evidence/solo-server-key-2026-10-27.json) records these results. They establish configuration access and closed gates, not customer login, active quotas or customer-authenticated Gemini chat.

Earlier hosted setup evidence:

- Hosted setup and verification runner: [`29de409f6ec784b5e8a6e550bcd0d4ca8e1381b9`](https://github.com/joshuawayzwright/ai-download-center/commit/29de409f6ec784b5e8a6e550bcd0d4ca8e1381b9).
- Earlier CI: [run 40468034635](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40468034635) passed **127 API/browser/smoke tests + 21 SQL tests = 148**, zero failures or skipped tests. [Repository quality run 40468034728](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40468034728) also passed.
- Earlier normal protected Preview: `dpl_3iKhAVdexUXURiQ5YupThKu5aVco`, **READY** at `29de409f6ec784b5e8a6e550bcd0d4ca8e1381b9`: [SOLO preview](https://solo-provider-industrial-3weap1tym-wrightwayz.vercel.app/solo-ai.html#conversation). It consumed the first five Preview variables with both customer flags false. No build override was used.
- Three real HTTP checks against that earlier deployment passed: account GET **200** with all three enabled/authenticated/chat booleans false and private/no-store caching; account refresh POST **503 `auth_disabled`**; customer chat POST **503 `customer_disabled`**. Marker: `SOLO_CUSTOMER_CONFIG_DISABLED_PASS`. These checks made no Supabase Auth or Gemini calls and do not establish live customer login.

Earlier implementation and browser evidence:

- Implementation: [`430e50ad98058d17bf4cf3fb1505a52301d32535`](https://github.com/joshuawayzwright/ai-download-center/commit/430e50ad98058d17bf4cf3fb1505a52301d32535), [draft PR #34](https://github.com/joshuawayzwright/ai-download-center/pull/34).
- CI: [SOLO API and database run 40449786312](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40449786312) passed: 118 API/browser/smoke tests and 21 SQL tests, zero failures. [Repository quality run 40449786100](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40449786100) also passed.
- Normal Vercel preview: `dpl_bgKY3WhfdNKAq9Yg1LVi9vHuYoKi`, READY, exact implementation SHA above. [SOLO preview](https://solo-provider-industrial-f8ujxpeox-wrightwayz.vercel.app/solo-ai.html#conversation) requires authorised Vercel access.
- Production homepage was rechecked and returned the existing maintenance page, HTTP 200. It was not promoted or changed.

At 04:29 UTC, six real HTTP checks against that protected deployment passed:

| Check | Actual result |
| --- | --- |
| Account status GET | 200, `enabled:false`, `authenticated:false`, `chatEnabled:false`, `no-store, private` |
| Account POST refresh while disabled | 503, `auth_disabled` |
| Chat GET | 405 |
| Chat POST without owner/customer credentials | 401 |
| Chat POST with a dummy customer Bearer credential while disabled | 503, `customer_disabled` |
| Account POST from another Origin | 403, `invalid_origin` |

The checks logged `SOLO_CUSTOMER_DISABLED_GATES_PASS`. They did not call Gemini,
Supabase Auth or any customer database. They prove that the deployed gates and
function bundle work; they do not prove live customer authentication.

In the actual desktop browser, the account panel showed that access was
unavailable, its login form stayed hidden, and a submitted chat request showed
the private-testing notice and restored the draft. No model reply was invented.
This verifies the closed-gate browser interaction, not active login or Samsung
device acceptance. The existing artwork was retained.

![Deployed account gate and honest chat rejection](evidence/solo-customer-preview-2026-10-27.jpg)

## Implemented behavior

- Same-origin `/api/solo-auth` login, status, refresh and logout, with no public signup action.
- Host-only Secure/HttpOnly/SameSite=Strict access and refresh cookies. Browser code and JSON responses contain no credentials.
- Online validation of the exact customer access JWT, followed by live session and membership checks in SQL. Customer credentials never fall back to the owner token.
- One existing chat route for browser cookies and future Android Bearer sessions. The Android client itself remains unfinished.
- Durable SQL admission before inference, with per-user and global minute/day allowances. A transaction locks and versions the policy row; no lock is held during Gemini inference.
- Request UUID and HMAC fingerprint prevent duplicate provider dispatch. Every reservation counts, including failed or unfinished calls; no automatic inference retry or refund.
- Provider outcome and safe token observations are recorded. A finalization failure returns an error, not a claimed successful conversation.
- A minimal account panel uses existing SOLO styling and artwork. Login status, usage, session expiry, rate-limit wait and already-accepted requests have explicit UI states. Account changes clear retained chat context.

The initial SQL policy is **disabled**, no members are created, and membership
defaults to blocked. Test caps are three requests/user/minute, 20/user/day,
20/global/minute and 200/global/day. These are bounded pilot defaults, not
approved paid subscription entitlements or a monetary spending budget.

## Database isolation and permissions

`solo_private` contains policy, membership and a request ledger. Client roles
cannot use the schema, read its tables or execute the three RPCs. RLS is enabled
and forced. The RPCs are `SECURITY INVOKER` with an empty search path and explicit
server-role execution grants.

The runtime may read policy/membership, reserve requests and finalize outcomes.
The new grants do not permit it to enable the policy, alter caps, enrol members,
delete reservations or write Supabase Auth data. Hosted inspection confirmed
these boundaries and exactly three readable `auth.sessions` columns: `id`,
`user_id` and `not_after`. No new Auth tables are created by the migration.

The ledger stores user/session/request identifiers, HMAC fingerprints, timestamps,
outcomes, model and token observations. It stores no prompt/reply text, email,
IP address, password or API key. Session/account deletion does not erase global
usage or reset its allowance. A reviewed retention/deletion process and
provider-side privacy disclosure remain release requirements.

## Hosted commercial database verification

The existing project `tymayhazawkofmiypeqt` is `ACTIVE_HEALTHY` in **The Solo
Service Provider** organisation `txfdoppxcbylrguxsjod`, on the **Free** plan in
its existing `ap-northeast-1` region. Reuse this project and region. WrightWayz
resources, credentials, data and billing were not used.

The hosted migration is version **`20261027071534`**, name
`solo_customer_admission`. The matching source is
[`supabase/migrations/20261027071534_solo_customer_admission.sql`](../supabase/migrations/20261027071534_solo_customer_admission.sql).
The local file was renamed to match the applied version without changing its SQL.
The sanitized [hosted database evidence](evidence/solo-commercial-database-2026-10-27.json)
records the observed grants, disabled-state calls and HTTP boundaries.

Live database inspection verified:

- All three `solo_private` tables have RLS enabled and forced.
- The checked functions use `SECURITY INVOKER` and an empty search path.
- `PUBLIC`, `anon` and `authenticated` lack the private schema/table/RPC permissions.
- Runtime grants do not allow changing policy settings, enrolling members,
  deleting ledger rows or writing Auth data; the session read grant is limited
  to the three columns listed above.
- Service-role calls inside rolled-back SQL transactions returned the expected
  disabled status, disabled admission, `invalid_request` for an invalid
  fingerprint, and `request_not_found` for an unknown finalization target.
- At this initial migration check, the state was **policy disabled, zero members, zero ledger rows**. The later controlled verification and final state are recorded above.

Actual HTTPS requests using the commercial publishable key also verified all
three SOLO RPCs reject anonymous calls with **HTTP 401 / SQL code `42501`**,
and requests selecting the private schema return **HTTP 406 / `PGRST106`**.
The check logged `SOLO_COMMERCIAL_ANON_BOUNDARY_PASS`; no key was logged.

Advisor results contain no warning/error findings. The five informational
findings are three RLS-without-policy notices, expected for these service-only
tables, and two unused indexes on the empty ledger. These results verify the
inspected grants and disabled boundaries, not a successful customer session or
simultaneous hosted admission.

The initial Auth settings GET returned HTTP 200 with `disable_signup=false`.
Before the controlled pilot, unrestricted signup was disabled and an actual
GET verified `disable_signup=true`, email authentication enabled, anonymous
users disabled and email auto-confirmation disabled. Keep provider signup closed;
the absence of an application signup action alone does not close that endpoint.

## Automated verification for the recorded cycle

The CI baseline used for this cycle, `40478171099` at `0af8d9c`, verifies **158 passing tests**: 137
API/browser/smoke tests and 21 SQL tests, with zero failures or skipped tests.
This includes the previous 153-test baseline plus five guarded-fixture tests.
The harness tests use mocked services; actual hosted authentication and quota
evidence is recorded separately in the linked live verification record.
Runtime code did not change for the later customer Gemini check; this suite
was not rerun and no new automated-test total is claimed for that cycle.

| Suite | Passing tests |
| --- | ---: |
| Existing chat API regressions | 31 |
| Customer access and quota adapter | 25 |
| Login, refresh, status and logout API | 20 |
| Account browser controller | 17 |
| Conversation browser controller | 21 |
| Existing opt-in owner smoke runner | 4 |
| New opt-in hosted verification runner | 9 |
| Read-only configuration probe | 5 |
| Guarded customer fixture tool | 5 |
| Actual SQL migration in PGlite | 21 |

The new runner and its prerequisites are documented in
[hosted customer verification](SOLO-HOSTED-CUSTOMER-VERIFICATION.md). Its mocked
tests exercise the harness, not real account creation, login or inference.

API and browser-controller tests use dummy credentials and simulated service
responses. They cover session/cookie/Origin boundaries, production disablement,
bad credentials, membership denial, DB/Auth outages, quota/duplicate mapping,
provider-failure accounting, finalization failure and preservation of the owner
testing path. Account tests cover secure cookie behavior, rotation, logout,
expiry, error handling and client state. Existing regression tests remain included.

SQL tests execute the actual generated migration using pinned PGlite 0.5.12
(PostgreSQL 18.6). Tests cover limits, duplicate IDs, session revocation and
ownership, member expiry/blocking, permissions, no refunds, immutable completion,
storage failure and usage persistence after account deletion.

PGlite has one connection. Queued simultaneous JavaScript calls prove the tested
SQL outcomes, but **do not prove overlapping independent hosted PostgreSQL
transactions**. The hosted schema/grants and disabled SQL boundaries are now
checked separately as recorded above. Live session rotation and five independent
HTTPS admission races have since passed in the controlled hosted window; see
[the live verification record](SOLO-CUSTOMER-LIVE-VERIFICATION-2026-10-27.md) and
[SQL test instructions](../tests/solo-database/README.md).

```sh
node --test powerhouse-website/tests/*.test.cjs
cd tests/solo-database
npm ci --ignore-scripts
npm test
```

The Node 24 local sandbox may summarize each isolated test file as one test.
Run an individual `.test.cjs` directly to see its assertion count. CI uses Node 22.
No test automatically calls Gemini or requires a real customer/provider secret.

## Commercial configuration at the close of the Gemini cycle

The commercial connection now reaches the existing project above. Project
creation and organisation authorization are no longer blockers. The connector
inspected in this cycle did not expose retrieval of the modern server secret key or mutation
of Auth signup settings. The existing project's server key has now been saved
securely in Vercel Preview and its hosted status-RPC access verified by the
read-only configuration probe in
[hosted customer verification](SOLO-HOSTED-CUSTOMER-VERIFICATION.md). Unrestricted
signup is now disabled and verified. Do not request another
Gemini key or repeat OpenAI/Groq setup.

At the close of this cycle, Vercel **Preview** configuration contained all six
variables below. Its final normal deployment `dpl_Fciqz77hEPSAg1FQ59UTcX13n9yM`
consumed the restored disabled customer flags, and its closed gates passed actual HTTP checks.
Any new controlled verification window will require deliberate gate settings
and a fresh deployment.

| Variable | Recorded state and purpose |
| --- | --- |
| `SOLO_CUSTOMER_AUTH_ENABLED` | Configured sensitive for Preview; **false** |
| `SOLO_CUSTOMER_CHAT_ENABLED` | Configured sensitive for Preview; **false** |
| `SOLO_SUPABASE_URL` | Configured for the existing commercial project |
| `SOLO_SUPABASE_PUBLISHABLE_KEY` | Configured sensitive; modern key for server Auth exchange |
| `SOLO_SUPABASE_SECRET_KEY` | Saved sensitive for Preview; **hosted status-RPC access verified** |
| `SOLO_USAGE_HASH_SECRET` | Configured sensitive; independently generated from 48 random bytes |

Keep the existing Gemini Preview configuration and private owner token. Never
copy charity keys or grant its resources to SOLO. Do not expose the server key
or owner token to the website, Android, source control, logs or issue comments.

The controlled Auth/quota and customer Gemini windows are complete and closed. The
account endpoint still requires an active SQL policy and unblocked, unexpired
membership before login. Two captured replies and successful SQL finalization
are verified; real provider-error/timeout and finalization-failure accounting
remain open. Actual branded website sign-in/chat and Samsung/desktop acceptance
also remain unverified. Future verification windows require deliberate settings
and monetary controls. Keep public inference disabled.

## Release gates recorded at the close of this cycle

- [x] Existing separate commercial project accessed and its schema/security advisors inspected.
- [x] Migration `20261027071534` applied; hosted grants/RLS and disabled service-role RPC outcomes verified.
- [x] Anonymous HTTPS calls to all three RPCs/private schema rejected with expected permission errors.
- [x] Five sensitive Preview variables configured; both customer flags remain false.
- [x] Save `SOLO_SUPABASE_SECRET_KEY` as a sensitive Preview variable.
- [x] Verify the saved key's hosted status-RPC access with the read-only configuration probe; SQL policy remains disabled.
- [x] Disable unrestricted Supabase signup and re-read actual Auth settings.
- [x] Create controlled test identities without email and expiring memberships; verify the bounded Auth/quota window.
- [x] Live customer login, cookie rotation and logout/revoked-session rejection verified.
- [x] Five independent hosted race scenarios demonstrate strict caps and duplicate suppression.
- [x] Actual customer chat API rejects exhausted quota with 429 before inference.
- [x] Close the earlier Auth/quota window; restore disabled gates/policy, block and expire test members, retain all 11 reservations, and verify that deployment.
- [x] Verify two captured customer-authenticated Gemini turns, context recall, exact quota decrement and durable successful SQL finalization.
- [x] Account for all four provider requests across both Gemini windows; retain 15 total ledger rows and verify final cleanup and disabled normal Preview.
- [ ] Verify real provider-error/timeout and finalization-failure accounting.
- [ ] Verify customer sign-in and complete conversation through the actual branded website UI.
- [ ] Desktop and Samsung browser behavior, keyboard, focus and accessible account/chat states verified.
- [ ] Approved customer retention/deletion disclosure, monetary controls and public abuse controls.
- [ ] Explicit production release approval and actual deployed production verification.

A passing test suite or READY deployment does not close those gates.

# SOLO live customer verification — 27 October 2026

## Auth/quota cycle result (historical)

**Real customer authentication, all five hosted admission race scenarios and
actual API quota rejection passed on the protected commercial Preview.** The
verification window is closed and cleanup is verified. No AI provider call was
made. At the close of this cycle, customer-authenticated Gemini replies,
provider-outcome error handling, mobile acceptance, monetary controls and public
release were unverified.

The subsequent [customer Gemini record](SOLO-CUSTOMER-GEMINI-VERIFICATION-2026-10-27.md)
verifies successful customer API conversation and finalization. The later
[browser-isolation record](SOLO-BROWSER-ISOLATION-2026-10-27.md) distinguishes
automated and closed-gate browser checks from signed-in website acceptance.
[Issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31) is
authoritative for current status; the results and deployment below belong to
this earlier zero-provider-call cycle.

This record extends the [server-key evidence](evidence/solo-server-key-2026-10-27.json)
and follows the existing [hosted verification harness](SOLO-HOSTED-CUSTOMER-VERIFICATION.md).
Sanitized machine-readable results are in
[the live verification evidence](evidence/solo-customer-live-verification-2026-10-27.json).

## Controlled setup

- The existing commercial Supabase project is `tymayhazawkofmiypeqt` in The Solo
  Service Provider organisation `txfdoppxcbylrguxsjod`.
- Actual Auth settings GET returned **200**: `disable_signup:true`, `email:true`,
  `anonymous:false`, `mailer_autoconfirm:false`. Unrestricted signup is now
  disabled.
- Guarded fixture tooling at commit
  [`0af8d9c263a1653128786061f3ffacea99b36894`](https://github.com/joshuawayzwright/ai-download-center/commit/0af8d9c263a1653128786061f3ffacea99b36894)
  created two controlled test identities through Auth Admin without sending email. Deployment
  `dpl_GSZGNr8jbyXZTBBgVxJRQ3X84kSF` logged
  `SOLO_CUSTOMER_FIXTURES_CREATED_PASS`.
- Test user UUIDs: `8b6a0501-0441-4476-813b-357657344c61` and
  `222e2393-6d53-449b-a350-0e29a36664a3`. Both were explicitly allowlisted until
  **2026-10-27 09:27:07 UTC**. Initial temporary user/global minute/day caps were
  each 12; the operator then prepared each tested quota boundary.
- Preview customer Auth was enabled for this bounded window; customer chat
  remained disabled during Auth and admission-race checks. Their target
  deployment `dpl_FvPg89QKpc7WXs1yhfYaWBU6KCy6` was
  **READY** at commit `0af8d9c263a1653128786061f3ffacea99b36894`:
  [protected SOLO Preview](https://solo-provider-industrial-2u2q8mspq-wrightwayz.vercel.app/solo-ai.html#conversation).

No application backend change was required for these results. The fixture tool
added five tests. [CI run 40478171099](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40478171099)
passed **137 API/browser/smoke + 21 SQL = 158 tests**, zero failures or skipped
tests, in jobs `122101471635` and `122101471320`.
[Repository quality run 40478171124](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40478171124)
also passed. These automated results are separate from the actual hosted checks below.

## Actual hosted authentication — passed

Diagnostic deployment: `dpl_Df7orHwpZ76zNkZk5Ch31Bpcc2eK`.
Run ID: `4bc1de46-0ec9-4bca-bafc-51a571fde85a`.

All seven checks passed:

1. Real login issued host-only Secure/HttpOnly/SameSite=Strict cookies.
2. Live account status succeeded without consuming allowance.
3. Refresh rotated credentials without a new session or quota debit.
4. Remote logout succeeded and cleared cookies.
5. The still-unexpired revoked JWT was rejected by the application and database session check.
6. Admission using the revoked session was denied.
7. The authentication run completed its session cleanup.

This run created **zero reservations** and made **zero AI provider calls**.
Final verification-window cleanup was checked separately below.

## Actual duplicate race — passed

Diagnostic deployment: `dpl_E151N3bLHrUoWkYLf39iTUXxMuHj`.
Request UUID: `803c6d5a-6f15-4d82-8bf3-f866d3e94200`.

Four independently connected HTTPS admission requests produced **one admission
and three denials** in 580 ms. Reusing that request UUID with a changed payload
produced a conflict. The final status showed the persisted allowance decrement,
and the test session was logged out.

The single admission remains a counted reservation; it is not a Gemini result.
No provider call, refund or ledger deletion was performed. Independent HTTP
requests exercise hosted transactions; this result does not claim precise
overlap of internal SQL statements.

## Actual hosted quota races — all four passed

These races ran after the duplicate scenario, in the order below. Each used
independent HTTPS connections, verified the persisted allowance decrement and
completed its session logout. Together with the duplicate race there are
**11 counted ledger reservations**; no provider calls were made.

| Scenario | Deployment | Requests | Admitted / denied | Duration |
| --- | --- | ---: | ---: | ---: |
| User daily | `dpl_HTT2ZdQxs1zJ2s6ZTqiqNeK9R6x6` | 4 | 2 / 2 | 552 ms |
| User minute, second fixture | `dpl_P5bqEafGhGqEAzCqDMSCuFaXNvV5` | 4 | 2 / 2 | 525 ms |
| Global daily | `dpl_BubZnyvgMZp8XW1NADtu4YKQzHBi` | 8 | 3 / 5 | 559 ms |
| Global minute | `dpl_CPRJGJPiG4Jyr4YMbfUNFKX48F7o` | 8 | 3 / 5 | 589 ms |

Run IDs and admitted request UUIDs are retained in the linked JSON evidence.
The global-minute scenario started with zero admissions in the rolling minute
and a cap of three.

## Actual customer API quota rejection — passed

Target deployment `dpl_HS65tfZkn5o3umneFj6r2C52f2sv` was **READY** at
[the protected quota-test Preview](https://solo-provider-industrial-6m3m4iksn-wrightwayz.vercel.app).
The SQL global daily cap was set to the existing count of **11 before** customer
chat was temporarily enabled in Preview. Real cookie-based customer login
returned **200**. Chat POST request
`54a17024-5212-4e56-854a-6c22cbb96d75` returned **429 `global_daily_limit`** with
a valid `Retry-After` and no reply. Logout returned **200**; the check logged
`SOLO_CUSTOMER_API_QUOTA_DENIAL_PASS`.

The denied request created zero ledger rows and made zero provider calls. This
verifies the customer API rejects exhausted quota before inference; it is not
evidence of a successful customer Gemini conversation.

## Cycle-closing cleanup and deployment — verified

- SQL policy is disabled and caps are restored to **3/user/minute,
  20/user/day, 20/global/minute and 200/global/day**.
- Both test memberships are blocked and expired; zero are active. Fixture Auth
  sessions are zero. The test identities were retained.
- All **11** ledger rows remain `reserved`, with provider fields `NULL`.
  The API-denied request has zero rows. No reservation was refunded or deleted.
- Preview customer Auth and chat flags are both false. Temporary fixture-creation,
  identity and target values were cleared.
- Final normal deployment `dpl_BDfkTt3NR4rJwy9XoBT9tJwsLnx8` is **READY** at
  commit `0af8d9c263a1653128786061f3ffacea99b36894`:
  [Auth/quota-cycle protected SOLO Preview](https://solo-provider-industrial-9i280wcne-wrightwayz.vercel.app/solo-ai.html#conversation).
  It has no build override and normal build logs.
- Actual final HTTP checks passed: account GET **200** with all three status
  booleans false and private/no-store caching; refresh POST **503 `auth_disabled`**;
  dummy customer Bearer chat POST **503 `customer_disabled`**. Marker:
  `SOLO_CUSTOMER_CONFIG_DISABLED_PASS`.
- Production still points to maintenance deployment
  `dpl_9KijhLqwcEABqisC59RiLYJgyeV8`; no production promotion occurred.

## Checklist at the close of this cycle

- [x] Unrestricted signup disabled and actual Auth settings re-read.
- [x] Controlled identities created without email and given expiring membership.
- [x] Hosted login, cookies, refresh, logout and revoked-session rejection.
- [x] Independent duplicate-request race and changed-payload conflict.
- [x] Per-user minute and daily quota races.
- [x] Global daily quota race.
- [x] Global minute quota race.
- [x] Actual customer API quota rejection with zero inference.
- [x] Final ledger inspection and confirmation that the verification window is closed.
- [x] Confirm policy disabled, test memberships blocked/expired and both Preview customer gates disabled after testing.
- [ ] Customer-authenticated Gemini conversation and provider-error accounting.
- [ ] Actual desktop/Samsung customer experience.
- [ ] Monetary controls and production/public release approval.

This Auth/quota verification cycle is complete. Customer chat was disabled at
its close. The unchecked items record that cycle's outstanding work; the later
Gemini evidence above closes successful API generation, while provider-error
accounting and actual customer browser acceptance remain separate gates.

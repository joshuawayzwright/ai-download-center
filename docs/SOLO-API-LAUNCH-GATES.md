# SOLO AI — Launch Gates and Shared API

**28 October update:** the commercial website is live with ten COMING SOON products. The customer branch has explicit production-origin gates, shutdown-safe logout, persistent account admission and new gated email verification/password recovery. See [account implementation and verification scope](SOLO-ACCOUNT-ONBOARDING-2026-10-28.md). The Auth-admission migration is **not applied**: two earlier calls and a later explicitly requested retry returned `Invalid or expired requestState`; independent readback confirms no new RPC/table. See [the dated connector investigation and follow-up](SOLO-MIGRATION-CONNECTOR-BLOCKER-2026-10-28.md). This does not establish expired OAuth. Public AI remains closed. The current section of issue #31 is authoritative; earlier milestones below retain their original scope.

Updated 27 October 2026. The authoritative current release checklist is
[GitHub issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31).
Its current-status section supersedes the historical execution log.

The subsequent [controlled membership workflow and cooldown fix](SOLO-MEMBER-OPERATIONS.md)
are committed at `3c9b214`, pass 291 automated tests, and have their own hosted
rollback and protected-Preview evidence. They do not resolve the separate
Auth-admission migration or open public customer access.

## Verified milestone snapshot — 27 October 2026
- API: `powerhouse-website/api/solo-chat.js`, deployed to private Vercel previews.
- Current provider: **Gemini**, default model `gemini-3.5-flash-lite`, with the existing server-side Preview key. OpenAI/Groq code paths are retained but are not the selected provider.
- Public inference: **OFF**. A private owner token is not customer authentication.
- Real customer login/session controls, five hosted quota/duplicate races and actual customer API quota rejection are verified. Two captured customer-authenticated Gemini turns also verified context recall, exact allowance decrement and durable successful finalization. See [Auth/quota evidence](SOLO-CUSTOMER-LIVE-VERIFICATION-2026-10-27.md) and [customer Gemini evidence](SOLO-CUSTOMER-GEMINI-VERIFICATION-2026-10-27.md).
- The existing commercial database is Supabase project `tymayhazawkofmiypeqt`, organisation `txfdoppxcbylrguxsjod` (The Solo Service Provider), Free plan, existing `ap-northeast-1` region. Its migration, server credential and hosted permission boundaries are verified; unrestricted signup is disabled. Reuse it; no new account or database setup is required.
- Both customer Preview flags and the SQL policy were restored disabled after testing. The last completed Gemini window retained 15 ledger rows: 11 earlier admission-only reservations and four Gemini successes. The first two Gemini calls have ledger-only evidence after lost client output; the later two have captured HTTP/context assertions.
- The account-isolation update at `057ed6114206fa0b0ab2c2ed094596410f2bdb76` and its earlier 179-test/closed-gate browser evidence are preserved. The subsequent immediate sign-out fix at `1a2738816fe764ec5ac1723fef377aca5f505ee0` passes 181 automated tests and is deployed in protected Preview. Actual signed-in website chat, live session changes/cross-tab behavior, Samsung/device acceptance, real provider-error/timeout and finalization-failure accounting, and monetary/public-launch controls remain open.
- At this earlier milestone production served maintenance deployment `dpl_9KijhLqwcEABqisC59RiLYJgyeV8`. It was superseded by the separately approved website release `dpl_7Bg2jvu7yKdHk5mfa8GqCHKrD3Nt`; do not promote a development branch wholesale.
- Android client: not yet connected to an authenticated production API.

## Private test contract
`POST /api/solo-chat`

```json
{"messages":[{"role":"user","content":"Hello SOLO"}]}
```

Required headers: `Content-Type: application/json`, same-origin `Origin` for browser calls, and `x-solo-test-token` for owner-only tests.

Vercel preview secrets (server-side only):
- `GEMINI_API_KEY`: existing sensitive Preview variable; never retrieve or print its value.
- `SOLO_PRIVATE_TEST_ENABLED`: must be explicitly `true` to allow owner tests.
- `SOLO_PRIVATE_TEST_TOKEN`: random secret, minimum 32 characters.
- `SOLO_AI_MODEL`: optional supported model override.
- `SOLO_AI_PROVIDER`: optional provider override, defaulting to Gemini; the customer path supports Gemini only.

**Never place private test tokens or provider keys in a browser bundle, URL, public repository, Android APK or screenshots.**

## Verification and release gates
`powerhouse-website/scripts/solo-private-smoke.cjs` is an opt-in server-side test of
the **deployed** `/api/solo-chat` endpoint, including denied requests and a real
two-turn Gemini conversation. It is separate from the historical provider-only
diagnostics. It logs only status, timing and request identifiers.

The script accepts a temporary Vercel share URL in `SOLO_SMOKE_TARGET_URL` and the
existing private token from the server environment. It rejects production, other
projects and cross-origin redirects. Never put those values in a browser, APK,
source file or build command. The temporary target must be blanked after use;
the diagnostic must not become an automatic build command.

Customer identity, hosted atomic admission and successful Gemini finalization
have completed their recorded API checks. Cost ceilings, monitoring, privacy and
retention/deletion safeguards, real provider-failure behavior, customer browser
and device verification, and production approval remain release gates in issue
#31. WrightWayz resources and community data remain separate; the earlier
inventory limitation has been resolved by the existing commercial project above.

## Browser account-isolation update

A separate cookie-chat account-binding change is implemented, reviewed and
deployed in protected Preview. Cookie requests include `expectedUserId`, matching
the authenticated UUID displayed by the browser. After online authentication,
a missing/malformed binding returns **400 `expected_account_required`** and a
mismatch returns **409 `account_changed`**, before quota admission or provider
dispatch. Explicit Bearer and private-owner requests remain compatible without
this field. See the [shared API contract](SOLO-SHARED-API-CONTRACT.md).

The browser clears stale conversation/draft/retry state on a known account
change and rechecks the server account. Cross-tab notifications contain only a
fixed signal; focus, visibility and restored-page checks provide additional
revalidation. An account mismatch is not a duplicate or evidence of admission.

At commit [`057ed6114206fa0b0ab2c2ed094596410f2bdb76`](https://github.com/joshuawayzwright/ai-download-center/commit/057ed6114206fa0b0ab2c2ed094596410f2bdb76),
[CI run 40497102111](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40497102111)
passed **158 JavaScript + 21 SQL = 179 tests**, zero failures/skips.
[Repository quality run 40497102226](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40497102226)
also passed. Controlled cross-tab integration exercises both actual browser
controllers with **mocked transports**; it is not a live signed-in browser test.

Normal Preview `dpl_CrptDDmWkonFKZ27xibWehkdHqJo` is **READY** at that commit:
[account-isolation verification Preview](https://solo-provider-industrial-3j5n9hezq-wrightwayz.vercel.app/solo-ai.html#conversation).
Four actual HTTP checks passed with gates closed: account GET **200**, all
status booleans false and private/no-store caching; refresh POST **503
`auth_disabled`**; dummy Bearer chat and `expectedUserId` chat without a cookie
both **503 `customer_disabled`**. These do not establish a live authenticated
400/409 account-binding rejection.

Actual Chrome at **1363 × 936** verified CTA navigation to `#conversation`
(section top 100.0625px, header bottom 77px), a visible first-Tab skip link at
8px and Enter focus on main, and keyboard progression from Check Access to
the outlined transcript log and message field. The account form remained hidden
and there was no horizontal overflow. This verifies those deployed desktop
closed-gate interactions; signed-in conversation/session-change and device
acceptance remain open.

The cycle made no new model call or hosted SQL write. A read-only commercial database
check at **11:36:42 UTC** confirmed disabled policy, original caps
**3/20/20/200**, zero eligible members/fixture sessions and 15 retained ledger rows with
four earlier Gemini successes. Production remains the same maintenance alias.
See [browser-isolation evidence](SOLO-BROWSER-ISOLATION-2026-10-27.md),
[sanitized results](evidence/solo-browser-isolation-2026-10-27.json) and
[desktop screenshot](evidence/solo-browser-preview-2026-10-27.jpg).

## Immediate local sign-out update

Code `1a2738816fe764ec5ac1723fef377aca5f505ee0` clears local identity and
conversation state before dispatching logout. Pending browser chat is aborted;
late replies cannot restore old transcript, draft or focus; new local chat
requests are blocked while sign-out is pending. Remote revocation remains a
separate server outcome. Peer notification still follows settlement, and fresh
status checks can rediscover a valid session if server sign-out failed. Local
abort cannot undo an already-admitted provider call.

Two new regressions failed against the original controller and passed after the
fix. [CI 40512204310](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40512204310)
passed **160 JavaScript + 21 SQL = 181 tests**, zero failures/skips.
Protected Preview `dpl_Dr62bzK8kLsqyXaoZUQfNbacjUsc` is READY at that source:
[SOLO Preview](https://solo-provider-industrial-pf0z4q0gh-wrightwayz.vercel.app/solo-ai.html#conversation).
Four deployed files match their source hashes and all four actual closed-gate
API checks pass. The desktop account panel remains private with login/sign-out
hidden. This is not a signed-in browser result. See
[sign-out verification](SOLO-LOGOUT-VERIFICATION-2026-10-27.md).

No model call, hosted database write, environment change or production promotion
occurred in this cycle. The existing test credentials are not retained; secure
browser sign-in remains required. Additional model calls also need verified
zero-cost entitlement or an approved monetary ceiling.

**Production private testing and public customer inference remain disabled.**
The completed Preview milestones do not authorize a production cutover or
publishing an owner token to customers.

# SOLO AI — Launch Gates and Shared API

Updated 27 October 2026. The authoritative current release checklist is
[GitHub issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31).
Its current-status section supersedes the historical execution log.

## Current status
- API: `powerhouse-website/api/solo-chat.js`, deployed to private Vercel previews.
- Current provider: **Gemini**, default model `gemini-3.5-flash-lite`, with the existing server-side Preview key. OpenAI/Groq code paths are retained but are not the selected provider.
- Public inference: **OFF**. A private owner token is not customer authentication.
- Real customer login/session controls, five hosted quota/duplicate races and actual customer API quota rejection are verified. Two captured customer-authenticated Gemini turns also verified context recall, exact allowance decrement and durable successful finalization. See [Auth/quota evidence](SOLO-CUSTOMER-LIVE-VERIFICATION-2026-10-27.md) and [customer Gemini evidence](SOLO-CUSTOMER-GEMINI-VERIFICATION-2026-10-27.md).
- The existing commercial database is Supabase project `tymayhazawkofmiypeqt`, organisation `txfdoppxcbylrguxsjod` (The Solo Service Provider), Free plan, existing `ap-northeast-1` region. Its migration, server credential and hosted permission boundaries are verified; unrestricted signup is disabled. Reuse it; no new account or database setup is required.
- Both customer Preview flags and the SQL policy were restored disabled after testing. The last completed Gemini window retained 15 ledger rows: 11 earlier admission-only reservations and four Gemini successes. The first two Gemini calls have ledger-only evidence after lost client output; the later two have captured HTTP/context assertions.
- Actual customer sign-in/chat through the website UI, Samsung/desktop acceptance, real provider-error/timeout and finalization-failure accounting, and monetary/public-launch controls remain open. HTTP API evidence does not close browser acceptance.
- Production serves the approved maintenance deployment `dpl_9KijhLqwcEABqisC59RiLYJgyeV8`. Do not promote a development branch wholesale.
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

A separate cookie-chat account-binding change is implemented and its local
source has been reviewed. Cookie requests include `expectedUserId`, matching
the authenticated UUID displayed by the browser. After online authentication,
a missing/malformed binding returns **400 `expected_account_required`** and a
mismatch returns **409 `account_changed`**, before quota admission or provider
dispatch. Explicit Bearer and private-owner requests remain compatible without
this field. See the [shared API contract](SOLO-SHARED-API-CONTRACT.md).

The browser clears stale conversation/draft/retry state on a known account
change and rechecks the server account. Cross-tab notifications contain only a
fixed signal; focus, visibility and restored-page checks provide additional
revalidation. An account mismatch is not a duplicate or evidence of admission.
Root verification of the new automated suite, deployment and live cross-tab
behavior is pending; the prior 158-test baseline does not verify this change.

**Production private testing and public customer inference remain disabled.**
The completed Preview milestones do not authorize a production cutover or
publishing an owner token to customers.

# SOLO shared chat contract (web + Android)

**Status:** PRIVATE PREVIEW. The owner-token API, real customer sessions, hosted
quota/duplicate controls and a captured two-turn customer Gemini conversation
with successful durable finalization are verified. The existing commercial
Supabase project is `tymayhazawkofmiypeqt`; no replacement database or account
setup is required. Both customer Preview flags and SQL policy were restored
disabled after testing. See [Auth/quota evidence](SOLO-CUSTOMER-LIVE-VERIFICATION-2026-10-27.md)
and [customer Gemini evidence](SOLO-CUSTOMER-GEMINI-VERIFICATION-2026-10-27.md).

The cookie account-binding and browser revalidation code below is implemented,
reviewed and deployed at `057ed6114206fa0b0ab2c2ed094596410f2bdb76`.
[CI run 40497102111](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40497102111)
passed **158 JavaScript + 21 SQL = 179 tests**, zero failures/skips;
[repository quality run 40497102226](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40497102226)
also passed. Cross-tab integration uses both actual controllers with **mocked
transports**. It does not establish live signed-in browser isolation.

Normal Preview `dpl_CrptDDmWkonFKZ27xibWehkdHqJo` is **READY** at that commit:
[current SOLO Preview](https://solo-provider-industrial-3j5n9hezq-wrightwayz.vercel.app/solo-ai.html#conversation).
Actual closed-gate HTTP checks passed: account GET 200/disabled/private no-store,
refresh POST 503 `auth_disabled`, and both dummy Bearer chat and
`expectedUserId` chat without a cookie 503 `customer_disabled`. Actual Chrome
**1363 × 936** verified the CTA/anchor offset, visible skip link and main focus,
keyboard access to the outlined log and message field, hidden sign-in form and
no horizontal overflow. Live signed-in UI/session changes/cross-tab behavior,
Samsung/device acceptance, real provider-error/finalization-failure accounting
and public release remain open.

This verification made no new model calls or hosted SQL writes. The read-only
**11:36:42 UTC** database check retained disabled policy, original caps
**3/20/20/200**, zero eligible members/fixture sessions and 15 rows with four
prior Gemini successes. Production still points to maintenance deployment
`dpl_9KijhLqwcEABqisC59RiLYJgyeV8`. See
[browser-isolation evidence](SOLO-BROWSER-ISOLATION-2026-10-27.md),
[sanitized results](evidence/solo-browser-isolation-2026-10-27.json) and
[desktop screenshot](evidence/solo-browser-preview-2026-10-27.jpg). The earlier
real Gemini evidence remains distinct from this no-inference browser cycle.

Endpoint: `POST https://thesoloserviceprovider.com.au/api/solo-chat` (future production; currently unavailable while the production site is in maintenance).
Private preview endpoint is on the Vercel preview deployment, not the production domain.

Browser customer request using the HttpOnly access cookie:
```json
{"requestId":"d83e81e9-8bfd-48f7-8ad1-3cb9899f1a0a","expectedUserId":"5066992e-32ca-49c6-91e0-0620c9ffba82","messages":[{"role":"user","content":"Help me plan my week"}]}
```

`expectedUserId` is the displayed account's UUID from verified `/api/solo-auth`
status. It is an account-consistency check, not a credential. Explicit customer
Bearer requests may omit it. Owner smoke requests omit both `requestId` and
`expectedUserId` and use their separate server-only testing credential.

Successful response:
```json
{"reply":"...","model":"gemini-3.5-flash-lite","provider":"gemini","requestId":"d83e81e9-8bfd-48f7-8ad1-3cb9899f1a0a","usage":{"remaining_daily":19,"daily_limit":20}}
```

Error response:
```json
{"error":"...","code":"user_daily_limit"}
```

## Client rules
- Up to 12 messages, 1,200 JavaScript string characters per message, and 16,000 UTF-8 bytes for the complete JSON request, including `requestId` and cookie-account `expectedUserId`. A valid alternating request starts and ends with `user`, so it contains at most 11 messages. Trim complete oldest user/assistant pairs to meet both limits.
- Send exactly `application/json` as the MIME type (charset parameters are allowed).
- Use HTTPS; do not store credentials in app bundles or browser local storage.
- Do not embed the private owner testing token in Android or web clients.
- The current private test token is only for backend smoke testing.
- Customer requests use verified login, server-validated identity and durable quotas; public abuse prevention and production approval remain release gates.
- Display the server's actual errors; never fabricate a model reply.
- The API does not execute tools, browse the internet, access connected accounts or act autonomously.

## Customer authentication

Browser account requests use `/api/solo-auth`, same-origin credentials and no
cache. Account mutations require an exact HTTPS `Origin`. There is no public
signup or invite-email action in this API.

| Method | Request | Outcome |
| --- | --- | --- |
| GET | No body | Sanitized account status, identity and daily usage; disabled deployments return `enabled:false` |
| POST | `{"action":"login","email":"...","password":"..."}` | Verify Auth and active membership, then set two HTTPOnly cookies |
| POST | `{"action":"refresh"}` | Rotate the refresh cookie and recheck current membership |
| POST | `{"action":"logout"}` | Revoke the current server session and clear both local cookies |

Cookies are named `__Host-solo-access` and `__Host-solo-refresh`, with `Secure`,
`HttpOnly`, `SameSite=Strict` and `Path=/`. No access or refresh token is returned
in JSON or placed in browser storage. An expired access cookie with a remaining
refresh cookie returns 401 so the browser attempts one refresh. A logout outage
clears local cookies but returns an error; it does not claim server revocation.

For future Android integration, the same `/api/solo-chat` route accepts
`Authorization: Bearer <customer access JWT>`. Never send an owner token or
Supabase secret from a device. Bearer tokens and access cookies together are
rejected as ambiguous. Native requests may omit Origin; cookie POSTs may not.

The server validates the exact token online and checks issuer, audience, user,
expiry and session claims. SQL additionally requires a currently live matching
session and an unblocked, unexpired commercial membership. A client-supplied
user or session ID never establishes identity or authorizes access.

## Cookie account consistency and browser revalidation

Cookies are shared by tabs on the same host. A conversation displayed for one
account must not be sent using another account's replacement cookie. The
sanitized browser account state therefore includes `userId`: the verified UUID
while authenticated, otherwise `null`. No session token, password or privileged
key is added to that state.

For cookie chat, the server performs normal request validation, credential and
Preview/provider checks, then online customer authentication. It compares
`expectedUserId` with that authenticated user **before** calling SQL admission
or the provider:

| Condition | Response | Admission/provider effect |
| --- | --- | --- |
| Missing or malformed UUID on a cookie request | 400 `expected_account_required` | No admission or provider dispatch |
| UUID differs from the verified cookie account | 409 `account_changed` | No admission or provider dispatch |
| UUID matches | Continue to membership/session/quota admission | Existing admission rules apply |

UUID comparison is case-insensitive. A body containing `expectedUserId` signals
customer intent: if its access cookie is missing, the open customer path returns
**401 `session_expired`**, never an owner-token fallback. A present invalid or
expired access token instead reaches online verification and returns
**401 `invalid_session`**.
Disabled gates and other earlier validation failures still take precedence.
Explicit Bearer customers remain compatible without the field; owner testing
requests without it are unchanged. Older cookie clients without the binding
must update before they can send chat under this contract.

The browser handles **409 `account_changed` before other 409 responses**. It
clears transcript, retained history, draft, retry UUID and wait state, aborts the
pending browser operation, blocks chat and emits `solo:account-stale` for a
server account recheck. It neither restores the old draft nor automatically
resends inference. Responses from the invalidated conversation are ignored.

Successful login and logout notify other tabs using a fixed, ephemeral
`account-changed` signal through `BroadcastChannel` when available. The signal
contains no identity, credentials or conversation text. Receiving it immediately
invalidates the old state and rechecks the server; it never supplies trusted
identity. Focus, becoming visible and restoration from the back/forward cache
also trigger account checks. Generation checks prevent stale account responses
from restoring invalidated state. Automated controller tests cover these
behaviors with mocked transports. Deployed closed-gate and desktop checks are
recorded above; live signed-in cross-tab/session-change verification remains open.

## Request admission and retries

- Generate a cryptographically random UUID for each new logical customer request.
- Preserve the same UUID for an unchanged manual retry after an uncertain result.
- No automatic inference retry is permitted. Refreshing an account never resends chat.
- SQL reserves allowance atomically before Gemini. Every reservation counts, including errors or unfinished calls.
- Reusing an admitted ID returns a duplicate/conflict 409; changing its payload still returns a conflict. Replies are not stored or replayed. The user must deliberately edit/send a new request to spend another allowance. Handle `409 account_changed` separately: it occurs before admission and requires clearing stale account context, not marking a request accepted.
- 429 includes `Retry-After`. Respect it; minute windows roll over 60 seconds and daily windows reset at UTC midnight.
- `usage` is a server snapshot. Another device may consume allowance afterward. Refresh account status to obtain a newer snapshot.
- Changing account clears retained browser conversation, draft and retry state and cancels the pending browser request. Cancellation cannot guarantee a provider call already admitted on the server is cancelled or refunded. A server-rejected account mismatch itself never reaches admission.

The customer path requires `VERCEL_ENV=preview`, explicitly configured customer
gates and the supported Gemini model. Production cannot enable customer inference
with the feature flag alone. The database policy independently defaults off.

## Error contract

| Status | Meaning |
| --- | --- |
| 400 | Invalid JSON, body shape or history; `expected_account_required` for missing/malformed cookie account binding |
| 401 | Missing/incorrect owner testing token; `invalid_session` for a present invalid/expired customer token; `session_expired` when customer intent remains but its access credential is missing; revoked customer sessions are also rejected |
| 403 | Invalid browser origin, or customer membership missing, blocked or expired |
| 405 | Method other than POST |
| 413 | Request exceeds the 16,000-byte body limit |
| 415 | Request is not JSON |
| 409 `account_changed` | Cookie account differs from the displayed UUID; clear stale context and recheck account; no admission occurred |
| 409, other duplicate/conflict code | Customer request ID was already admitted or its fingerprint conflicts; do not dispatch it again |
| 429 | Customer/global quota exhausted, or Auth rate limit; honor `Retry-After` |
| 502 | Provider returned an error or no visible answer; an upstream HTTP status may be included |
| 503 | Gate/configuration disabled, Auth/database unavailable, or usage finalization failed |
| 504 | Provider request timed out or failed |

Errors never count as a model reply. Keep failed user messages out of the
successful conversation history. Retain their text for a manual retry only
while the same account/conversation remains valid; an account change clears
that draft and retry state. Gemini parts marked as thoughts are not included
in `reply`.

A finalization failure returns an error even when Gemini answered, because the
durable usage record could not be confirmed. Its reservation remains consumed.
Do not interpret a timeout, 502, 503 or 504 as proof that no allowance was used.

The current Android starter still reads the obsolete `answer` response field;
its integration must use `reply` and customer authentication before release.

## Shared implementation plan
Follow [issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31)
for verified progress and the single current release checklist. Customer sessions,
durable request admission, usage accounting, browser/device validation and future
permissioned tools must use this shared commercial API.

Commercial SOLO AI is separate from WrightWayz and its community support data.

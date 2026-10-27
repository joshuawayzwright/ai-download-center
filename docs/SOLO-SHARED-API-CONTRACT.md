# SOLO shared chat contract (web + Android)

**Status:** PRIVATE TEST ONLY. The owner-token API is verified. Customer access is implemented behind Preview-only gates but awaits its separate commercial database and live verification. This document is not proof of a public AI service.

Endpoint: `POST https://thesoloserviceprovider.com.au/api/solo-chat` (future production; currently unavailable while the production site is in maintenance).
Private preview endpoint is on the Vercel preview deployment, not the production domain.

Customer request (owner smoke requests do not require a request ID):
```json
{"requestId":"d83e81e9-8bfd-48f7-8ad1-3cb9899f1a0a","messages":[{"role":"user","content":"Help me plan my week"}]}
```

Successful response:
```json
{"reply":"...","model":"gemini-3.5-flash-lite","provider":"gemini","requestId":"d83e81e9-8bfd-48f7-8ad1-3cb9899f1a0a","usage":{"remaining_daily":19,"daily_limit":20}}
```

Error response:
```json
{"error":"...","code":"user_daily_limit"}
```

## Client rules
- Up to 12 messages, 1,200 JavaScript string characters per message, and 16,000 UTF-8 bytes for the complete JSON request. A valid alternating request starts and ends with `user`, so it contains at most 11 messages. Trim complete oldest user/assistant pairs to meet both limits.
- Send exactly `application/json` as the MIME type (charset parameters are allowed).
- Use HTTPS; do not store credentials in app bundles or browser local storage.
- Do not embed the private owner testing token in Android or web clients.
- The current private test token is only for backend smoke testing.
- Public clients require proper login, server-validated user identity, durable quotas and abuse prevention.
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
session and an unblocked, unexpired commercial membership. User or session IDs
in a client request body are never trusted.

## Request admission and retries

- Generate a cryptographically random UUID for each new logical customer request.
- Preserve the same UUID for an unchanged manual retry after an uncertain result.
- No automatic inference retry is permitted. Refreshing an account never resends chat.
- SQL reserves allowance atomically before Gemini. Every reservation counts, including errors or unfinished calls.
- Reusing an admitted ID returns 409; changing its payload still returns 409. Replies are not stored or replayed. The user must deliberately edit/send a new request to spend another allowance.
- 429 includes `Retry-After`. Respect it; minute windows roll over 60 seconds and daily windows reset at UTC midnight.
- `usage` is a server snapshot. Another device may consume allowance afterward. Refresh account status to obtain a newer snapshot.
- Changing account clears retained browser conversation context and cancels the pending browser request. Cancellation cannot guarantee a provider call already admitted on the server is cancelled or refunded.

The customer path requires `VERCEL_ENV=preview`, explicitly configured customer
gates and the supported Gemini model. Production cannot enable customer inference
with the feature flag alone. The database policy independently defaults off.

## Error contract

| Status | Meaning |
| --- | --- |
| 400 | Invalid JSON, body shape or conversation history |
| 401 | Missing/incorrect owner testing token, or invalid/expired/revoked customer session |
| 403 | Invalid browser origin, or customer membership missing, blocked or expired |
| 405 | Method other than POST |
| 413 | Request exceeds the 16,000-byte body limit |
| 415 | Request is not JSON |
| 409 | Customer request ID was already admitted or its fingerprint conflicts |
| 429 | Customer/global quota exhausted, or Auth rate limit; honor `Retry-After` |
| 502 | Provider returned an error or no visible answer; an upstream HTTP status may be included |
| 503 | Gate/configuration disabled, Auth/database unavailable, or usage finalization failed |
| 504 | Provider request timed out or failed |

Errors never count as a model reply. Keep failed user messages out of the
successful conversation history and retain their text for retry. Gemini parts
marked as thoughts are not included in `reply`.

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

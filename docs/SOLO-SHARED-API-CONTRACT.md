# SOLO shared chat contract (web + Android)

**Status:** PRIVATE TEST ONLY. This document is a client contract, not proof of a working public AI service.

Endpoint: `POST https://thesoloserviceprovider.com.au/api/solo-chat` (future production; currently unavailable while the production site is in maintenance).
Private preview endpoint is on the Vercel preview deployment, not the production domain.

Request:
```json
{"messages":[{"role":"user","content":"Help me plan my week"}]}
```

Successful response:
```json
{"reply":"...","model":"gemini-3.5-flash-lite","provider":"gemini"}
```

Error response:
```json
{"error":"..."}
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

## Current private error contract

| Status | Meaning |
| --- | --- |
| 400 | Invalid JSON, body shape or conversation history |
| 401 | Missing or incorrect owner testing token |
| 403 | Invalid or cross-origin browser request |
| 405 | Method other than POST |
| 413 | Request exceeds the 16,000-byte body limit |
| 415 | Request is not JSON |
| 502 | Provider returned an error or no visible answer; an upstream HTTP status may be included |
| 503 | Private gate disabled or required server configuration missing |
| 504 | Provider request timed out or failed |

Errors never count as a model reply. Keep failed user messages out of the
successful conversation history and retain their text for retry. Gemini parts
marked as thoughts are not included in `reply`.

## Native Android client (apps/solo-android)

Verified 12 November 2026 (AEST):

- The app reads `reply` (the obsolete `answer` field is no longer used), applies the
  limits above, sends a fresh UUID `requestId` with every attempt, sends no `Origin`
  header, and keeps failed turns out of history.
- When customer sign-in ships, the app sends `Authorization: Bearer <access token>`,
  the native path `parseAccessToken` already accepts in PR #34. It never sends
  `expectedUserId` (cookie-only) or the owner `x-solo-test-token`.
- At start-up it sends `{}` to check that the endpoint is deployed. Request validation
  rejects that body with 400 before any access gate or provider call, so no
  conversation text or inference is involved. A 404 means the endpoint is not deployed.
- **Production status:** `POST https://thesoloserviceprovider.com.au/api/solo-chat`
  returned **404** on 12 November 2026. The live site is deployed from
  `solo-commerce/public-static-release`, which has no chat API. The app shows an honest
  "not open yet" state until the endpoint is deployed.
- **Sign-in and reporting:** PR #52 (stacked on #34) adds native token sign-in to
  `/api/solo-auth` (`X-Solo-Client: android`) and `POST /api/solo-report`. The app shows
  sign-in and Report only when `GET /api/solo-auth` reports `enabled: true`.

## Shared implementation plan
Follow [issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31)
for verified progress and the single current release checklist. Customer sessions,
durable request admission, usage accounting, browser/device validation and future
permissioned tools must use this shared commercial API.

Commercial SOLO AI is separate from WrightWayz and its community support data.

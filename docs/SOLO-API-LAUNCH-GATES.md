# SOLO AI — Launch Gates and Shared API

Updated 27 October 2026. The authoritative current release checklist is
[GitHub issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31).
Its current-status section supersedes the historical execution log.

## Current status
- API: `powerhouse-website/api/solo-chat.js`, deployed to private Vercel previews.
- Current provider: **Gemini**, default model `gemini-3.5-flash-lite`, with the existing server-side Preview key. OpenAI/Groq code paths are retained but are not the selected provider.
- Public inference: **OFF**. A private owner token is not customer authentication.
- The development website has a conversation UI. [Draft PR #34](https://github.com/joshuawayzwright/ai-download-center/pull/34) implements customer sessions and durable quotas, with 148 automated checks recorded; it remains unmerged. Real customer login, independent hosted quota races and customer-authenticated Gemini chat remain unverified.
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
- `SOLO_AI_PROVIDER`: optional provider override; defaults to Gemini.

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

Customer identity, durable atomic quotas, cost ceilings, privacy safeguards,
device verification and owner approval remain release gates in issue #31.
The initial 27 October inventory only exposed the inactive WrightWayz project.
Later same-day evidence in [issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31)
confirms the existing commercial Supabase project is accessible and its admission
migration is applied. Reuse that commercial project; WrightWayz remains separate.
Customer verification still requires the missing server-side Preview secret,
restricted pilot signup and the remaining live test gates. Preserve disabled
customer gates until the controlled pilot is ready.

**Do not set `SOLO_PRIVATE_TEST_ENABLED=true` in production until rate limits and authentication are ready.** Preview-only owner tests must not be mistaken for a public product.

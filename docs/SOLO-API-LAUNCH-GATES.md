# SOLO AI — Launch Gates and Shared API

## Current status
- API: `powerhouse-website/api/solo-chat.js`, deployed to Vercel preview.
- Model provider: OpenAI Responses API, server-side only.
- Public inference: **OFF**.
- Website assistant: keyword navigation guide only, not generative chat.
- Android app: not yet connected.

## Private test contract
`POST /api/solo-chat`

```json
{"messages":[{"role":"user","content":"Hello SOLO"}]}
```

Required headers: `Content-Type: application/json`, same-origin `Origin` for browser calls, and `x-solo-test-token` for owner-only tests.

Vercel preview secrets (server-side only):
- `OPENAI_API_KEY`: configured, value not verified.
- `SOLO_PRIVATE_TEST_ENABLED`: must be explicitly `true` to allow owner tests.
- `SOLO_PRIVATE_TEST_TOKEN`: random secret, minimum 32 characters.
- `SOLO_AI_MODEL`: optional supported model override.

**Never place private test tokens or provider keys in a browser bundle, URL, public repository, Android APK or screenshots.**

## Release gates
1. [ ] Automated Node tests pass in CI.
2. [ ] Private POST request returns an actual provider response.
3. [ ] Persistent per-user authentication (not a shared test token).
4. [ ] Durable rate limiting and quotas across serverless instances.
5. [ ] Cost alerts, budget controls and request telemetry with privacy safeguards.
6. [ ] Safety, privacy, abuse and prompt-injection tests.
7. [ ] Web chat UI tested on Samsung and desktop.
8. [ ] Android client uses the same authenticated API.
9. [ ] Owner approves public launch.

**Do not set `SOLO_PRIVATE_TEST_ENABLED=true` in production until rate limits and authentication are ready.** Preview-only owner tests must not be mistaken for a public product.

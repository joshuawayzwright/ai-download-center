# SOLO shared chat contract (web + Android)

**Status:** PRIVATE TEST ONLY. This document is a client contract, not proof of a working public AI service.

Endpoint: `POST https://thesoloserviceprovider.com.au/api/solo-chat` (future production; currently disabled).
Private preview endpoint is on the Vercel preview deployment, not the production domain.

Request:
```json
{"messages":[{"role":"user","content":"Help me plan my week"}]}
```

Successful response:
```json
{"reply":"...","model":"..."}
```

Error response:
```json
{"error":"..."}
```

## Client rules
- Up to 12 messages, 1,200 characters per message.
- Use HTTPS; do not store credentials in app bundles or browser local storage.
- Do not embed the private owner testing token in Android or web clients.
- The current private test token is only for backend smoke testing.
- Public clients require proper login, server-validated user identity, durable quotas and abuse prevention.
- Display the server's actual errors; never fabricate a model reply.
- The API does not execute tools, browse the internet, access connected accounts or act autonomously.

## Shared implementation plan
1. Verify private provider response and GitHub test suite.
2. Add authenticated session tokens for web and Android.
3. Add persistent rate limiting and usage accounting.
4. Introduce shared UI components and accessibility tests.
5. Add tools only with explicit user permissions and audit logs.

Commercial SOLO AI is separate from WrightWayz and its community support data.

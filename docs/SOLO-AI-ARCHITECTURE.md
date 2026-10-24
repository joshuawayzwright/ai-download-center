# SOLO AI — Shared Product Architecture

Status: planning and integration specification (not a live generative AI service).

## Mission
SOLO AI will serve both The Solo Service Provider Powerhouse website and a future standalone mobile application.

## Current foundations
- AI Download Centre provides a public catalogue in `data/tools.json`.
- Powerhouse uses a catalogue-connected site guide and has an experimental Vercel `/api/solo-chat` endpoint.
- No OpenAI API key is currently configured in the Powerhouse Vercel project.
- A live generative AI service must not be claimed until authenticated API calls and safety/cost controls are tested.

## Architecture
1. **Knowledge**: versioned product and project metadata, catalogue entries, FAQs and official URLs.
2. **Shared API**: authenticated, rate-limited `/api/solo-chat` deployed server-side with provider credentials in Vercel environment variables.
3. **Web client**: embedded SOLO assistant on Powerhouse and standalone `/solo-ai.html` experience.
4. **Mobile client**: future Android/iOS app consuming the same API, with per-user authentication and abuse controls.
5. **Payments**: separate checkout and entitlement verification; never infer paid access from the confirmation page alone.

## Security and privacy gates
- Never expose API keys in frontend JavaScript or GitHub.
- Add durable per-user and per-IP rate limiting, request-size limits, spending alerts and provider usage caps before public release.
- Do not persist chat history without explicit retention policy and user-facing notice.
- Do not expose private GitHub, Stripe or customer data through public tool access.
- Cite catalogue sources and distinguish listings from verified recommendations.

## Release criteria
- [ ] Real model configured server-side and tested.
- [ ] Rate limits, logging and cost controls validated.
- [ ] Privacy notice updated for AI interactions.
- [ ] Standalone app icon, manifest and mobile usability checked.
- [ ] Stripe webhook/fulfilment audited independently.
- [ ] Production launch approved after preview testing.

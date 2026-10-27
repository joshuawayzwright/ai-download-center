# SOLO AI — Shared Product Architecture

Status: private Gemini integration and development clients; no public generative AI service.
Current release evidence and remaining gates: [issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31).

## Mission
SOLO AI will serve both The Solo Service Provider Powerhouse website and a future standalone mobile application.

## Current foundations
- AI Download Centre provides a public catalogue in `data/tools.json`.
- Powerhouse has a catalogue-connected site guide plus a separate conversation UI and private Vercel `/api/solo-chat` endpoint.
- The endpoint uses the existing Gemini Preview key, with `gemini-3.5-flash-lite` as its default model. Existing OpenAI credentials are retained; no new OpenAI billing or Groq signup is required.
- Production is under maintenance; development previews are not a public release.
- No commercial customer identity or durable quota database was found in the current code or connected Supabase inventory. Keep the inactive WrightWayz database separate.
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
Track completion only in the current section of issue #31. A ready Vercel build,
a provider-only diagnostic and a successful private API conversation are distinct
milestones; none proves customer login, paid fulfilment or a production launch.

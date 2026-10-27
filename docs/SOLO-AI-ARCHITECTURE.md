# SOLO AI — Shared Product Architecture

Status: verified private Gemini API; customer sessions and durable admission implemented for a disabled preview pilot. The existing commercial database migration and hosted permission boundaries are verified. Live customer login, hosted quota races and customer Gemini chat remain unverified. No public generative AI service.
Current release evidence and remaining gates: [issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31).

## Mission
SOLO AI will serve both The Solo Service Provider Powerhouse website and a future standalone mobile application.

## Current foundations
- AI Download Centre provides a public catalogue in `data/tools.json`.
- Powerhouse has a catalogue-connected site guide plus a separate conversation UI and private Vercel `/api/solo-chat` endpoint.
- The endpoint uses the existing Gemini Preview key, with `gemini-3.5-flash-lite` as its default model. Existing OpenAI credentials are retained; no new OpenAI billing or Groq signup is required.
- Production is under maintenance; development previews are not a public release.
- Customer identity, session lifecycle, usage admission and a web account panel are implemented. The existing commercial Supabase project `tymayhazawkofmiypeqt` belongs to The Solo Service Provider organisation `txfdoppxcbylrguxsjod`, on the Free plan in `ap-northeast-1`. Its migration is applied; reuse this project and keep WrightWayz resources separate.
- Sensitive Preview configuration now includes the commercial URL, publishable key, independent usage-hash secret and both customer flags set false. The server secret key is absent, and actual Auth settings still allow unrestricted signup. These settings block the live customer pilot.
- A live generative AI service must not be claimed until authenticated API calls and safety/cost controls are tested.

## Architecture
1. **Knowledge**: versioned product and project metadata, catalogue entries, FAQs and official URLs.
2. **Shared API**: `/api/solo-chat` with server-only Gemini credentials. Owner smoke testing retains its private token; customer sessions use online Supabase Auth validation followed by durable SQL admission. The customer path requires explicit Preview configuration and defaults off.
3. **Web client**: embedded SOLO assistant on Powerhouse and standalone `/solo-ai.html` experience.
4. **Mobile client**: future Android/iOS app consuming the same API, with per-user authentication and abuse controls.
5. **Payments**: separate checkout and entitlement verification; never infer paid access from the confirmation page alone.

## Security and privacy gates
- Never expose API keys in frontend JavaScript or GitHub.
- The implemented customer path reserves per-user and global rolling-minute/UTC-day allowance before inference. Input/output bounds limit each request. Verify those controls against the actual commercial service, and add public-launch abuse controls, spending alerts and monetary budgets before release.
- Do not persist chat history without explicit retention policy and user-facing notice.
- Do not expose private GitHub, Stripe or customer data through public tool access.
- Cite catalogue sources and distinguish listings from verified recommendations.

## Customer pilot implementation

`/api/solo-auth` provides same-origin login, refresh, status and logout for invited
testers. Access and refresh tokens stay in `Secure`, `HttpOnly`, `SameSite=Strict`
host-only cookies. Browser JavaScript receives identity and allowance only.
The shared chat API also accepts an explicit customer Bearer token for a future
native client; no Android login integration is claimed.

Online Auth verification is followed by a live `auth.sessions` and membership
check in SQL. The `solo_private` schema is denied to client roles. Three public
RPCs run as their caller and are executable only by the server role. A short
policy-row transaction serializes check-and-reserve. The runtime cannot enable
the policy, change caps or enrol users.

Hosted migration `20261027071534_solo_customer_admission.sql` is applied. Actual
inspection verified all three FORCE RLS tables, invoker/empty-search-path
functions, denied client privileges and runtime grants limited to the required
operations. Service-role checks in rolled-back transactions verified disabled
and invalid-request paths; the policy is false with zero members and ledger rows.
Actual HTTPS calls also confirmed anonymous denial of all three RPCs and the
private schema. These checks do not establish concurrent hosted admission or
customer-authenticated inference.

The account route requires the live SQL policy and an unblocked, unexpired
membership before returning an authenticated session. A controlled auth-only
test may keep the customer chat flag off while the policy is enabled for that
verification window. Both application customer paths additionally require
`VERCEL_ENV=preview`. Configure the missing server key and disable unrestricted
Supabase signup before activating that window, then redeploy to consume the new
Preview variables. No provider or session secret belongs in browser code.

Every admitted request consumes allowance, even if Gemini fails or the client
disconnects. Duplicate IDs cannot dispatch another inference. Only request and
session identifiers, HMAC fingerprints, times, outcomes and provider token
observations are stored; prompts and replies are not persisted by SOLO's ledger.
Provider-side data handling and a complete retention/deletion policy remain
release requirements.

See [customer access verification and setup](SOLO-CUSTOMER-ACCESS-2026-10-27.md)
and [SQL tests](../tests/solo-database/README.md) for evidence and remaining gates.

## Release criteria
Track completion only in the current section of issue #31. A ready Vercel build,
a provider-only diagnostic and a successful private API conversation are distinct
milestones; none proves customer login, paid fulfilment or a production launch.

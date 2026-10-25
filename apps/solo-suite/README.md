# SOLO AI — Business Command (prototype)

An isolated, local-first commercial suite in the existing AI Download Center repository. This is a real working static app prototype, not ten fully launched paid Android products. Existing site, Stripe, and WrightWayz systems remain untouched.

## Ten tools
1. LeadPilot: manual lead records, opportunity values, stage transitions, reply drafts.
2. Business OS: persistent task board, priority, task completion and pipeline summaries.
3. QuoteSnap: AUD quote calculations with optional 10% GST.
4. ReviewBoost: personalised neutral review invitations; never selectively solicit only positive reviews.
5. ReelForge: vertical short-video storyboards and captions; NO rendered videos.
6. SiteAgent: local FAQ records and keyword-answer demonstration; NOT a public chatbot.
7. Content Machine: marketing draft templates by channel.
8. Proposal Pro: client proposals; NOT legal contracts.
9. KitLab: personalised AI prompt packs.
10. Inbox Commander: manual pasted-message triage and response templates; NO inbox connections.

## Architecture and data
- Standalone HTML/CSS/JavaScript, with zero runtime dependencies and no external AI/API requests.
- LocalStorage key: solo-suite-v1. No sign-in, sync, encryption, multi-device access or tenant isolation.
- Export your data to JSON. Never put sensitive customer information into a shared or untrusted browser.
- Commercial and WrightWayz charity data are not shared.
- Temporary text monogram is NOT the approved SOLO symbol.
- PWA manifest is present; service worker/offline caching and Play Store application have not been built.

## Run
Serve repository root with `python3 -m http.server 8080` and visit `/apps/solo-suite/`. Or serve this folder directly and visit `/`.

## Build verification
- [x] Created ten functional front-end workflows.
- [x] Created local storage + JSON export, copy and .txt export.
- [x] Created isolated feature branch; no production site modifications.
- [x] Parsed the full app JavaScript through the V8 JavaScript compiler.
- [ ] Verify browser interactions and Samsung-class mobile viewport.
- [ ] Verify production Vercel preview and custom URL.
- [ ] Integrate dedicated commercial Supabase project with auth, RLS, back-ups and data deletion.
- [ ] Connect genuine server-side AI and third-party customer messaging with spend caps and consent.
- [ ] Implement compliant Stripe / Google Play purchase flows, trials, entitlements and refunds.
- [ ] Apply approved artwork, mobile accessibility QA and security testing.
- [ ] Build, sign and test Android App Bundles before Play Store submission.

## No release claims
Current version is a clickable prototype. It is not ready for sale, handling confidential customer information or publication on Google Play.
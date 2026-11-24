# AI Download Center: status, 24 November 2026

Handoff note from the session of 18–24 November 2026. Read this first when picking the work back up.

## Live

- Site: https://joshuawayzwright.github.io/ai-download-center/ (GitHub Pages, deploys on merge to `main`)
- Featured listing: $99 USD/month, 7-day free trial, live Stripe link `https://buy.stripe.com/7sYfZh9Tcb1hfQQ6dFeAg08` (set in `config.js`).
  The older link `…dRmfZh7L4edt6gg1XpeAg04` is **switched off** in Stripe; never use it.
- Public support contact: `hello@thesoloserviceprovider.com.au` (personal Gmail and mobile removed from the site in PR #68).

## Done this session

| PR | Change |
|---|---|
| #63 | Added free catalog entries: Hob, e2e, TrustedRouter, Sonilo, Melius (facts checked on each official site) |
| #68 | Business email on config, footer, privacy and terms; mobile number removed from terms and README; CI check updated |
| #81 | New guide pages `chatgpt-alternatives.html` (13 tools) and `ai-voice-video-tools.html` (10 tools), added to the home guide grid, `sitemap.xml` and the build allowlist |
| #92 | Guide pages `ai-agent-builders.html`, `open-source-llms.html`, `ai-tools-for-small-business.html`, `open-source-android-apps.html` |
| (this PR) | Guide pages `ai-model-apis.html`, `offline-ai-tools.html`, `ai-tools-for-students.html` (15 guides in total) |

How a new guide page is wired in: copy the `local-ai-apps.html` structure, add the file to `PUBLIC_FILES` in `scripts/build-public-site.py`, add a `<url>` to `sitemap.xml`, and add a card to the `#guides` grid in `index.html`. Use only hand-picked catalog entries (no `source` field) for facts.

## Sponsor outreach (wave 1)

Prospects launched or funded Sept–Nov 2026, all now listed free in the catalog:

| Tool | Contact route | State |
|---|---|---|
| Hob (Frigade) | hello@frigade.com | Gmail draft ready, not sent |
| Sonilo | info@sonilo.com (confirmed on sonilo.com) | Gmail draft ready, not sent |
| e2e | form at e2e.com/contact (Partnerships) | Not sent |
| TrustedRouter | form at trustedrouter.com/contact | Not sent |
| Melius | form at melius.com/contact | Not sent |
| Pi (Earendil), Lightsprint | no public business contact | On hold |

Full email texts are in the owner's Google Drive ("AI Download Center sponsor emails, wave 1"); the local copy under `marketing/drafts/` is gitignored. One follow-up after 5+ days, then stop. Make no traffic claims; the site has no public traffic numbers.

## Open items for the owner (optional)

1. Confirm the test email reached `hello@thesoloserviceprovider.com.au` (sent 21 Nov from Gmail; no bounce seen).
2. Stripe public details still show a personal mobile and street address on receipts: https://dashboard.stripe.com/settings/public
3. Stripe payouts are on a manual schedule: https://dashboard.stripe.com/settings/payouts
4. Submit `sitemap.xml` in Google Search Console so the new guides get indexed sooner.

## Ideas not started

- More guide pages need more hand-picked catalog entries first; most curated entries are now covered by a guide.
- "Loop 1" missed-call text-back service for local businesses: outreach kit and a Google Sheet lead tracker exist in the owner's Drive ("Missed-Call Text-Back Lead Tracker"); it needs a separate domain and a paid platform, so it is parked.

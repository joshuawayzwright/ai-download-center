# SOLO AI — Android / Google Play Release Plan

SOLO AI is one product with two clients:
1. Embedded Powerhouse website assistant.
2. Standalone Android app.

Both must use the same server-side AI API and versioned knowledge source.

## Approved visual identity
- SOLO AI: futuristic gold-and-silver robotic face with electric-blue eyes.
- The Solo Service Provider: metallic gold S with electric-blue energy core.
- Keep official master artwork in a versioned `assets/branding/` folder, with 512x512 and 192x192 exports.
- Do not replace the approved marks with generic icons.
- Use SOLO AI emblem for Android launcher and notification branding; business S for the website identity.

## Architecture
- `solo-knowledge.json`: public business and project knowledge.
- `data/tools.json`: public AI Hub discovery catalogue.
- `/api/solo-chat`: Vercel-hosted inference endpoint, using server-only credentials.
- Android client: Kotlin + Jetpack Compose, or Trusted Web Activity for first release if PWA passes installability and app-quality checks.
- Authentication: optional for free discovery, required for accounts, purchases, and private conversation history.
- Versioned API and shared privacy policy for web/mobile.

## Security release gates
- [ ] Model provider key configured in Vercel server environment.
- [ ] Durable rate limits, abuse controls, usage caps, and spending alerts.
- [ ] CORS and origin policies designed for Android client authentication (do not rely on Origin alone).
- [ ] Privacy disclosure for AI messages and retention; no secret keys in Android binaries.
- [ ] Data deletion and support workflows.
- [ ] Testing for hallucinated product availability and unsafe advice.

## Google Play gates
- [ ] Register developer account and verify publisher details.
- [ ] Confirm SOLO AI name/brand rights and prepare store listing.
- [ ] Build signed Android App Bundle (.aab), not just a website shortcut.
- [ ] If using TWA, verify Digital Asset Links against signing certificate SHA-256.
- [ ] Provide 512x512 launcher icon, feature graphic, screenshots, privacy policy and data safety declaration.
- [ ] Meet target Android API and Google Play policies applicable at submission time.
- [ ] Test on Samsung Galaxy S26 Ultra and other Android screen sizes.
- [ ] Internal testing, closed testing if required, then staged release.

## Current status
Specification only. Not published to Google Play. Live generative model and production abuse controls remain outstanding.

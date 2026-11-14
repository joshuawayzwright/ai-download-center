# SOLO AI — Native Android Starter

A native Android Java starter project for SOLO AI, designed to share the Powerhouse `/api/solo-chat` backend. This is **source code**, not an APK/AAB or published Google Play application.

## Build
Open `apps/solo-android` in Android Studio with JDK 17, let Gradle sync, then build the app. Gradle wrapper is not included. No signing keys or API secrets are committed.

## Current behaviour
- Native dark-and-gold chat screen.
- Requests the shared production API only; never embeds model provider secrets.
- Opens the public AI Download Centre in the user's browser.
- Clearly states when live AI is not configured.
- No accounts, paid subscriptions, background sync or analytics.
- Artwork is not yet embedded in native Android resources; use the approved SOLO AI icon in the final store build.

## Before Play Store release
1. Enable and test server-side AI and enforce persistent rate limits, abuse controls and spend caps.
2. Test privacy disclosures, accessibility, error states and lifecycle handling.
3. Add approved Android adaptive icons, screenshots and branding.
4. Build and sign an Android App Bundle.
5. Complete Google Play developer verification, data safety, privacy policy and testing requirements.
6. Test on Samsung S26 Ultra and additional Android devices.

**Do not publish this starter as a finished AI app.**

## SOLO commercial suite preview (25 October 2026)

The native starter on branch `feature/solo-commercial-suite` includes an **Open SOLO Business Tools (preview)** button that opens https://solo-ai-business-command.vercel.app/ in the device browser. This is a navigation link only: the ten web modules are not yet native screens, no mobile purchases are connected and no Android build/AAB has been generated or device-tested for this change. The existing AI Download Centre button and chat API behaviour remain unchanged.

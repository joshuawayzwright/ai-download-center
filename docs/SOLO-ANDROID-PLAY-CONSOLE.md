# SOLO AI — Google Play Console guide

Prepared 12 November 2026 (AEST). Requirements were checked against Play Console Help
that day. Re-check anything marked *confirm in Console*, because Google changes these.

## Where things stand

| Item | Status |
| --- | --- |
| Android client (`apps/solo-android`) | Builds. 29 automated tests pass. Lint has 0 errors. Targets API 36 (required since 31 Aug 2026). |
| Release bundle (`.aab`) | Builds **unsigned**. It must be signed with your upload key before Play accepts it. |
| Live chat on production | **Not available.** `thesoloserviceprovider.com.au/api/solo-chat` returns 404. The app shows "isn't open yet". |
| Native sign-in | **Not available.** PR #34 sign-in issues browser cookies only. |
| In-app reporting of AI replies | **Not built.** Play requires it for AI chat apps, and it needs a small server endpoint. |
| Privacy notice | **Does not cover SOLO AI or the app yet.** Play requires a policy that covers the app's data. |
| Published to Play | No. |

**Internal testing can start now.** Production release is blocked until live chat,
in-app reporting and the privacy notice are done. Play's minimum-functionality and
AI-content policies would reject a chat app that cannot chat.

## Decisions that are permanent

- **Package name** `au.com.thesoloserviceprovider.solo` can never change after the first upload.
- **Free app:** once published as free, it can never become a paid download. In-app
  subscriptions can still be added later, which matches the plan.
- **Account type:** a *personal* account created after 13 Nov 2023 must run a closed test
  with **at least 12 testers opted in for 14 consecutive days** before production. An
  *organisation* account skips that rule but needs a D-U-N-S number.

## Step 1 — Create the upload key (your computer, once)

Do this yourself and keep the file and passwords in a password manager.
Never commit them or send them in chat.

```bash
keytool -genkeypair -v -keystore solo-upload.jks -alias solo-upload \
  -keyalg RSA -keysize 4096 -validity 10000
```

Play App Signing holds the real app-signing key. If this upload key is lost, Google can
reset it, so it is recoverable.

## Step 2 — Build the signed bundle

```bash
cd apps/solo-android
export SOLO_UPLOAD_STORE_FILE=/path/to/solo-upload.jks
export SOLO_UPLOAD_STORE_PASSWORD='…'  SOLO_UPLOAD_KEY_ALIAS=solo-upload  SOLO_UPLOAD_KEY_PASSWORD='…'
export SOLO_VERSION_CODE=1            # increase by 1 for every upload
./gradlew :app:testDebugUnitTest :app:lintRelease :app:bundleRelease
# Output: app/build/outputs/bundle/release/app-release.aab
```

## Step 3 — Play Console set-up

1. Create the developer account at https://play.google.com/console/signup and complete
   identity verification.
2. **Create app:** name *SOLO AI*, default language English (Australia), type *App*,
   *Free*, then accept the declarations.
3. **Testing → Internal testing → Create release.** Accept Play App Signing, upload the
   `.aab`, add release notes, then add testers by email list and share the opt-in link.
4. Complete **App content** (Policy → App content):
   - **Privacy policy:** a URL whose page covers SOLO AI chat. See the draft points below.
   - **App access:** while chat is closed, state that there is no login. Once sign-in
     ships, provide a reviewer test account.
   - **Ads:** no ads.
   - **Content rating:** complete the questionnaire. The category is utility or productivity,
     with user-to-AI chat.
   - **Target audience:** 18+ is recommended, which avoids Families policy obligations.
   - **Data safety:** see the draft below.
   - **AI-generated content:** declare that the app generates AI content. In-app reporting
     must exist before production.
5. **Store listing:** the 512×512 icon is `powerhouse-website/assets/approved-stage/solo-ai-app-icon-512.png`.
   You also need a 1024×500 feature graphic and at least 2 phone screenshots. CI produces
   reference screenshots, but use real-device captures. Add short and full descriptions
   that make no claims about unreleased features.
6. **Closed test** (personal accounts): 12+ testers for 14 consecutive days, then
   **Apply for production**. Review takes about 7 days or more.

## Draft Data safety answers (*confirm in Console*)

- **Data collected:** *App activity → Other user-generated content* (chat messages). Sent
  to the SOLO server and on to Google's Gemini API to produce replies. Required for app
  functionality. Not used for ads.
- **Shared:** not shared for third-party purposes. Gemini processes data on our behalf as
  a service provider, so check Google's current Gemini API data terms for retention.
- **Encrypted in transit:** yes (HTTPS only, cleartext disabled).
- **Stored on device:** no. Backup is disabled.
- **Deletion:** after sign-in ships, account and data deletion must be available in-app
  and through a web link.
- **Not collected:** location, contacts, analytics, device identifiers and crash reporting.
  The app has no SDKs.

## Privacy notice additions (website, before production)

The live notice (updated 10 Nov 2026) covers website, purchases and email. Before
production it also needs to cover:
- the SOLO AI app and chat: what is sent, to whom (the server and Google Gemini), and retention;
- usage limits and request records (PR #34 stores request metadata, not prompts or replies);
- account data and deletion, once sign-in exists;
- the contact address for privacy requests.

## Server work required before production

1. Deploy `/api/solo-chat` on the production domain (today it returns 404).
2. Add a native sign-in path that returns tokens to the app. The current one sets
   HttpOnly cookies only. The chat API already accepts `Authorization: Bearer`.
3. Add an in-app report endpoint so users can flag a reply without leaving the app.
4. Confirm spending caps and abuse controls on the production project.

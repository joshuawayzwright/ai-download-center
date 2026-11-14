# SOLO AI for Android

The SOLO AI app from The Solo Service Provider: a Kotlin and Jetpack Compose (Material 3)
client for the shared SOLO API ([contract](../../docs/SOLO-SHARED-API-CONTRACT.md)). It holds
no provider keys. This is separate from `android-app/`, which is the WrightWayz catalogue app.

## Features

- **Streaming conversation:** replies appear as SOLO writes them, with an animated gold and
  blue "aura" while it thinks. **Stop** halts a reply; a stopped reply is shown, marked
  "Stopped", and never joins the history.
- **Answers with sources:** when the server grounds a reply in Google Search, its web
  pages appear as tappable chips under the reply (https only, at most 8) and are saved
  with the conversation.
- **Formatted answers:** headings, lists, quotes, bold and italic text, inline code, code
  blocks with **Copy code**, and https-only links, rendered natively. The parser is safe on
  partial streamed text.
- **Reply actions:** copy, **read aloud** (the phone's own text-to-speech, en-AU), share,
  **regenerate** the latest answer, and **report** (Google Play AI-content policy).
- **Saved conversations:** a history drawer with new, open and delete. Conversations are kept
  in the app's private storage (`conversations.json`, newest 50), excluded from backup and
  device transfer, and removed on uninstall. Settings can delete them all.
- **Voice input:** the system speech-to-text intent. The app never records audio and has
  no microphone permission.
- **Accounts:** sign in, **create a free account** and **reset a password**, all in one
  sheet that appears only when the server enables app sign-in. Both use an 8-digit code
  emailed by `/api/solo-onboarding` and typed into the app (no links or landing pages); after
  a correct code the app signs straight in. The password from the form stays in memory only
  for that step. Create account appears only when the server reports `signupEnabled`, and
  "Forgot password?" only with `recoveryEnabled`. The access token is kept in memory. The refresh token is encrypted with a
  non-exportable Android Keystore AES-GCM key. A temporary error never signs the user out,
  and a refresh can't undo a sign-out.
- **Settings:** account details, plan and messages left today, sign out, delete
  conversations, **delete account** (in the app, with confirmation; also clears this
  phone's conversations), request deletion by email, privacy, terms, contact, open-source licences and version.
- **Design:** branded splash screen, the approved SOLO AI icon (adaptive, round and
  themed), the bundled Inter typeface (SIL OFL; licence in `res/raw`), edge-to-edge
  layout, TalkBack labels and 48dp targets.
- **Honest states:** "isn't open yet", "sign in", "offline" and "can't confirm your sign-in"
  cards. The app never fakes a reply.

## Structure

| File | Role |
| --- | --- |
| `MainActivity.kt` | Splash, edge-to-edge, hosts the Compose UI |
| `ChatViewModel.kt` | All app logic: service checks, accounts, streaming, history, reporting, read aloud |
| `ui/` | Compose screens: `ChatScreen`, `Components`, `Sheets` (sign-in, report), `SettingsScreen`, `Theme` |
| `MarkdownText.kt`, `HistoryStore.kt`, `ChatModels.kt` | Pure Kotlin parser, storage and models |
| `SoloApi.java`, `AccountApi.java`, `Conversation.java`, `SessionStore.java` | Tested protocol core: chat with SSE streaming, native sign-in and reporting, contract limits, encrypted session |

## Build and test

Requires JDK 21 and the Android SDK (platform 36). The Gradle wrapper is included.

```bash
cd apps/solo-android
./gradlew :app:testDebugUnitTest   # protocol, parser, storage and Compose UI tests (+ Play screenshots)
./gradlew :app:lintRelease
./gradlew :app:assembleDebug       # test APK (package suffix .debug)
./gradlew :app:bundleRelease       # release .aab (unsigned unless signing is configured)
```

`SoloAppUiTest` drives the real Compose app against a scripted local server and writes the
1080×2160 Play screenshots to `app/build/play-screenshots/`. The opt-in contract tests
(`BackendContractTest`, `AccountBackendContractTest`) run the HTTP clients against real
SOLO handlers when `SOLO_BACKEND_*_URL` is set.

### Release signing (never commit keys)

Signing values come from environment variables or `~/.gradle/gradle.properties`:
`SOLO_UPLOAD_STORE_FILE`, `SOLO_UPLOAD_STORE_PASSWORD`, `SOLO_UPLOAD_KEY_ALIAS`,
`SOLO_UPLOAD_KEY_PASSWORD`, plus `SOLO_VERSION_CODE` (increase it on every upload).
`*.jks`, `*.keystore` and `keystore.properties` are git-ignored.

### Endpoint

Defaults to `https://thesoloserviceprovider.com.au/api/solo-chat`. Override with
`-PSOLO_API_URL=https://...`. The URL must use HTTPS.

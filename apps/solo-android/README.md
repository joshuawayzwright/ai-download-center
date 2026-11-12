# SOLO AI for Android

Native Android client for SOLO AI by The Solo Service Provider. It uses the shared
`/api/solo-chat` service ([contract](../../docs/SOLO-SHARED-API-CONTRACT.md)) and
holds no provider keys or secrets. This is separate from `android-app/`, which is
the WrightWayz catalogue app.

**Status:** release-ready client build. It is **not published**, and live chat
depends on the server work in [the Play Console guide](../../docs/SOLO-ANDROID-PLAY-CONSOLE.md).

## What it does

- Dark, mobile-first chat in the brand-lock palette, using the approved SOLO AI artwork
  (adaptive, round and Android 13+ themed launcher icons).
- Follows the API contract: reads `reply`, keeps at most 11 alternating messages,
  1,200 characters per message and 16,000 UTF-8 bytes per request, trims the oldest
  complete pairs first, and sends a fresh `requestId` with every attempt.
- Shows the server's actual error text. Failed messages stay visible with **Retry** and
  never enter the history. Quota waits use `Retry-After`.
- Checks the service at launch without sending any conversation text. If the endpoint
  is missing (404) or switched off (503 or the private-test gate), the composer is locked
  and an honest "isn't open yet" card appears, with no fake replies.
- Handles edge-to-edge and the keyboard on Android 15/16, keeps state across rotation and
  process death, and copies messages on long-press. Uses TalkBack labels and 48dp targets.
- Stores nothing on the device. Backup and device transfer are disabled. Has no
  analytics, ads or third-party SDKs, and uses only the `INTERNET` permission.
- **Sign-in, sign-out and reporting replies** (server side in PR #52) appear only when
  `GET /api/solo-auth` reports `enabled: true` for the app. Until then the app behaves
  exactly as above. The access token stays in memory. The refresh token is encrypted with
  a non-exportable Android Keystore AES-GCM key before it is written to private storage,
  and it is excluded from backup. An expired access token is refreshed once and the
  message resent. Each signed-in reply has a **Report** button that sends the reason,
  optional note and reply text to `/api/solo-report` without leaving the app.

## Build

Requires JDK 21 (the Robolectric UI tests for API 36 need it; app bytecode targets Java 17)
and the Android SDK (platform 36). The Gradle wrapper is included.

```bash
cd apps/solo-android
./gradlew :app:testDebugUnitTest   # unit, HTTP and Robolectric UI tests (+ screenshots)
./gradlew :app:lintRelease
./gradlew :app:assembleDebug       # installable test APK (package suffix .debug)
./gradlew :app:bundleRelease       # release .aab (unsigned unless signing is configured)
```

UI test screenshots are written to `app/build/screenshots/`.

### Release signing (never commit keys)

Signing values come from environment variables or `~/.gradle/gradle.properties`:
`SOLO_UPLOAD_STORE_FILE`, `SOLO_UPLOAD_STORE_PASSWORD`, `SOLO_UPLOAD_KEY_ALIAS`,
`SOLO_UPLOAD_KEY_PASSWORD`, plus `SOLO_VERSION_CODE` (increase it on every upload).
`*.jks`, `*.keystore` and `keystore.properties` are git-ignored.

### Testing against a real handler

`BackendContractTest` runs the app's HTTP client against a running SOLO chat handler.
It is skipped unless `SOLO_BACKEND_OPEN_URL` and/or `SOLO_BACKEND_CLOSED_URL` are set.
`AccountBackendContractTest` does the same for sign-in and reporting, using
`SOLO_BACKEND_ACCOUNT_URL`.

### Endpoint

Defaults to `https://thesoloserviceprovider.com.au/api/solo-chat`. Override with
`-PSOLO_API_URL=https://...`. The URL must use HTTPS.

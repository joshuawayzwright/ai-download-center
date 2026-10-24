# WrightWayz AI Centre — native Android

WrightWayz-branded Android app integrated with the existing AI Download Centre repository.

Existing web directory: https://joshuawayzwright.github.io/ai-download-center/
WrightWayz: https://wrightwayz.com/

## What is built

Native Android Java interface (not a WebView); AI catalogue search, filters, saved favourites, share function, tool-detail popup and labelled sponsored listings. Catalogue bundled from data/tools.json at build time for offline use. Optional online refresh fetches the current GitHub main branch over HTTPS and caches it locally.

No account, analytics SDK, in-app payment, silent APK installer or automated clinical guidance.

## Android versions

Android package: com.wrightwayz.aicentre
Minimum SDK: 26
Target SDK: 36
Version: 1.0.0

## Build the app

Open the android-app directory in Android Studio using JDK 17 and Android SDK 36, or run from the repository root with Gradle 8.13:

    gradle -p android-app :app:assembleDebug :app:bundleRelease

Files produced after successful build:

- android-app/app/build/outputs/apk/debug/app-debug.apk — install on an Android phone for testing.
- android-app/app/build/outputs/bundle/release/app-release.aab — release bundle, which is UNSIGNED until signing secrets are configured.

GitHub Actions provides the same build automatically. Open the repository's Actions tab, choose WrightWayz Android build, select Run workflow and the feature branch, then use the artifacts attached to a successful run.

## Sign your Android App Bundle for Google Play

1. Generate a private upload key in Android Studio or using Java keytool on your secure PC:
    
    keytool -genkeypair -v -keystore wrightwayz-upload.jks -alias wrightwayz-upload -keyalg RSA -keysize 3072 -validity 10000

2. Keep the keystore and passwords backed up OFF GitHub. Never paste them in chat.
3. In GitHub repository Settings > Secrets and variables > Actions, add:
   - WRIGHTWAYZ_KEYSTORE_BASE64 (base64 encoding of the .jks file)
   - WRIGHTWAYZ_KEYSTORE_PASSWORD
   - WRIGHTWAYZ_KEY_ALIAS
   - WRIGHTWAYZ_KEY_PASSWORD
4. Rerun the build workflow. When all secrets are present, it signs the release AAB using your upload key.

For managed Google Play App Signing, Google holds the app signing key and you control the upload key.

## Publishing checklist

1. Test the APK on a real phone including search, category filters, favourites, provider links, offline mode and refresh.
2. Visit https://play.google.com/console/ and open or create your developer account.
3. Create an app with package com.wrightwayz.aicentre. Check package naming first; it cannot be changed once released.
4. Review the privacy notice at PRIVACY.md and proposed store listing at PLAY_STORE_LISTING.md.
5. Produce screenshots, store icon, feature graphic; complete Data Safety, content rating, app access and audience forms.
6. Upload the signed AAB to an internal testing track.
7. Satisfy testing requirements applicable to your developer account, fix defects, then request production release.

The Android build requires the full repository: the offline snapshot comes from the sibling data/tools.json file. Copying the Android subdirectory alone will omit that data.

No existing GitHub Pages, Stripe or website production files need modification to ship the app.

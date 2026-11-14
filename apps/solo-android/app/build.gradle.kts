plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Release signing is read from environment variables or ~/.gradle/gradle.properties.
// Never commit a keystore or its passwords. With no keystore configured,
// bundleRelease produces an unsigned bundle for verification only.
fun signingValue(name: String): String? =
    (System.getenv(name) ?: providers.gradleProperty(name).orNull)?.takeIf { it.isNotBlank() }

val uploadStore = signingValue("SOLO_UPLOAD_STORE_FILE")

android {
    namespace = "au.com.thesoloserviceprovider.solo"
    compileSdk = 36

    defaultConfig {
        applicationId = "au.com.thesoloserviceprovider.solo"
        minSdk = 26
        targetSdk = 36
        versionCode = (signingValue("SOLO_VERSION_CODE") ?: "2").toInt()
        versionName = "1.1.0"
        // Shared SOLO API (docs/SOLO-SHARED-API-CONTRACT.md). Override with
        // -PSOLO_API_URL=https://... for testing; it must be HTTPS.
        val apiUrl = signingValue("SOLO_API_URL") ?: "https://thesoloserviceprovider.com.au/api/solo-chat"
        require(apiUrl.startsWith("https://")) { "SOLO_API_URL must use HTTPS" }
        buildConfigField("String", "SOLO_API_URL", "\"$apiUrl\"")
    }

    signingConfigs {
        if (uploadStore != null) {
            create("upload") {
                storeFile = file(uploadStore)
                storePassword = signingValue("SOLO_UPLOAD_STORE_PASSWORD")
                keyAlias = signingValue("SOLO_UPLOAD_KEY_ALIAS")
                keyPassword = signingValue("SOLO_UPLOAD_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (uploadStore != null) signingConfig = signingConfigs.getByName("upload")
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = true
        warningsAsErrors = false
        checkReleaseBuilds = true
    }

    testOptions { unitTests.isIncludeAndroidResources = true }
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.06.01")
    implementation(composeBom)
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.activity:activity-compose:1.12.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")

    testImplementation(composeBom)
    testImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    // The Android framework's org.json is a stub in local JVM unit tests.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20260814")
    // Drives the real activity on the JVM (no emulator needed) and renders screenshots.
    testImplementation("org.robolectric:robolectric:4.16.1")
}

// Opt-in contract test against a running SOLO chat handler (see README):
// SOLO_BACKEND_OPEN_URL / SOLO_BACKEND_CLOSED_URL point at local harness servers.
tasks.withType<Test>().configureEach {
    listOf("SOLO_BACKEND_OPEN_URL", "SOLO_BACKEND_CLOSED_URL", "SOLO_BACKEND_ACCOUNT_URL", "SOLO_BACKEND_STREAM_URL").forEach { name ->
        System.getenv(name)?.let { systemProperty(name, it) }
    }
}

tasks.withType<JavaCompile>().configureEach { options.compilerArgs.add("-Xlint:deprecation") }

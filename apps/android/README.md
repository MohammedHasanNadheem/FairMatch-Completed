# FairMatch Android

Native Android application using Kotlin and Jetpack Compose. It is a first-class client of the same Vercel Node API used by the web app; it does not contain MySQL, JWT or AI credentials.

## Open locally

1. Open `apps/android` in Android Studio (JDK 17, Android SDK 35).
2. Copy `gradle.properties.example` values into your user Gradle properties or a local ignored `gradle.properties` file.
3. Sync Gradle and run the `app` configuration on an emulator or physical Android 8+ device.

## Build a release candidate

1. In Android Studio, open **Build → Generate Signed Bundle / APK**.
2. Choose **Android App Bundle** for Play Store release.
3. Create or select a private upload keystore; never commit the keystore or its passwords.
4. Use the release `FAIRMATCH_API_BASE_URL` and test sign-in, sign-out, candidate discovery and organisation pending access on a physical device before uploading the `.aab` to Play Console internal testing.

The current MVP includes registration, email/password sign-in, pending organisation-access status, encrypted local session-token storage and sign-out through the Vercel API. Add `FAIRMATCH_API_BASE_URL=https://your-project.vercel.app` before building a release. API tokens never grant direct MySQL or AI-provider access.

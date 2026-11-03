# Mobile apps (iOS and Android)

Capacitor packages the web app into native apps (ADR 0036). `ios/` and `android/` are the native projects; edit them for permissions, icons and signing. The web code lives in `apps/web` as usual.

## Build the web bundle into the apps

```bash
npm run sync -w @pocket-pantry/mobile
```

This builds `apps/web` into `www/` against the hosted API and copies it into both projects. Set `API_URL` to use another API, e.g. `API_URL=http://192.168.1.128:3000`. In the apps the session is a Bearer token (`apps/web/src/lib/nativeSession.ts`).

## iOS (on a Mac with Xcode 26 or later)

1. `npm ci`, then `npm run sync -w @pocket-pantry/mobile`.
2. `npm run open:ios -w @pocket-pantry/mobile` opens Xcode. Pick the team under Signing & Capabilities, run on a device, or Product > Archive and upload to TestFlight.

## Android (JDK 21 and the Android SDK)

1. `npm run sync -w @pocket-pantry/mobile`.
2. `npm run open:android -w @pocket-pantry/mobile` opens Android Studio, or build from `android/` with `./gradlew assembleDebug`.

The release APK must always be signed with the same keystore. Keep it and its passwords outside the repo, and back them up.

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

Or from a terminal, also over SSH: `TEAM_ID=<team> apps/mobile/scripts/build-ios.sh <device-udid>` syncs, builds, installs on the phone and opens the app. It stamps a build number (the Mac's local time, `YYYYMMDD.HHMM`) as the app's `CFBundleVersion`, and Settings shows it under Sign out with the commit, e.g. "Build 20261106.1758 · 9dabce4". A plain `npm run sync` sets no build, so Settings shows none. Over SSH, unlock the login keychain first (`security unlock-keychain`), or signing fails with `errSecInternalComponent`.

## Android (JDK 21 and the Android SDK)

1. `npm run sync -w @pocket-pantry/mobile`.
2. `npm run open:android -w @pocket-pantry/mobile` opens Android Studio, or build from `android/` with `./gradlew assembleDebug`.

The release APK must always be signed with the same keystore. Keep it and its passwords outside the repo, and back them up.

## Camera orientation lock (`@capacitor/screen-orientation`)

On a phone in the app, the camera locks the screen to portrait while it is open and unlocks when it closes (ADR 0037). Tablets are never locked. The plugin is a dependency of `apps/web` (the code) and `apps/mobile` (so the Capacitor CLI finds it). Its docs for Capacitor 8 ask for:

- iOS: an `application(_:supportedInterfaceOrientationsFor:)` hook in `AppDelegate.swift` that returns the bridge view controller's orientations. Done. It reads the root view controller from the `window` argument, because `self.window` is nil under the UIScene lifecycle. `UIRequiresFullScreen` is only needed to lock an iPad, which we never do, so it is not set.
- Android: nothing in the manifest. (Android 16 ignores the lock on large screens, which does not matter because tablets are not locked.)

After changing the plugin, a human must run `npx cap sync` (or `npm run sync -w @pocket-pantry/mobile`) and rebuild both apps. The generated plugin lines in `android/capacitor.settings.gradle`, `android/app/capacitor.build.gradle` and `ios/App/CapApp-SPM/Package.swift` are committed.

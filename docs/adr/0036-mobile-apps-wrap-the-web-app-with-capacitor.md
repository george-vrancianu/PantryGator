# The mobile apps wrap the web app with Capacitor and hold the session as a Bearer token

The SPEC planned a Flutter app against the same API. We ship the iOS and Android apps by packaging the existing web app with Capacitor instead. The research is in `docs/research/mobile-flutter-vs-capacitor.md`. This replaces the Flutter plan in `docs/SPEC.md` and the Flutter notes in ADR 0002.

## Decision

- **Capacitor 8 packages the web build.** The React app, `packages/ui`, the i18n files and the client-side logic (Pantry roll-up, Scan Session, Voice Inbox) ship unchanged. The native projects live in `apps/mobile`, which takes a web build made with `VITE_API_URL` pointing at the hosted API.
- **The apps run from bundled files**, not from the hosted site (`server.url`). The origins are `capacitor://localhost` on iOS and `https://localhost` on Android, and the API allows both, for CORS and for Better Auth.
- **In the apps, the session is a Bearer token.** WKWebView drops the API's session cookie, because the app's origin is not the API's. Better Auth's `bearer` plugin hands the signed session token over in a `set-auth-token` header on sign-in and sign-up. The app keeps it in the app's private storage (`@capacitor/preferences`) and sends it as `Authorization: Bearer`. Only the signed value is accepted. Browsers keep the cookie, unchanged.
- **Distribution while testing:** a signed APK shared directly for Android, and internal TestFlight for iOS (no Beta App Review).

## Considered options

- **Flutter.** Rejected: it means rewriting about 78k lines of web and UI code, then keeping two UIs in step on every ticket.
- **Loading the hosted site in the app (`server.url`).** Rejected: Capacitor says it is not meant for production, and it is the weakest case under App Store guideline 4.2.
- **CapacitorHttp (native requests, native cookie jar).** Rejected: every photo and Voice Note body would cross the bridge as base64, and it is unverified whether abort and `keepalive` survive.
- **Keychain or Keystore storage for the token.** Not now: Preferences is private to the app, which is about what a browser's cookie store gives. We can move the token later without touching the API.

## Consequences

- Sign-in and sign-up responses carry the session token in `set-auth-token`, which CORS exposes. A request from the apps that carries no cookie is not checked against the origin allow-list by Better Auth. That is safe, because a Bearer token is never sent by the browser on its own.
- `https://localhost` is an allowed origin with credentials. A page served on `https://localhost` on a Member's own computer could call the API with their cookie. We accept that.
- iOS builds need a Mac with Xcode, and an Apple Developer Program membership.

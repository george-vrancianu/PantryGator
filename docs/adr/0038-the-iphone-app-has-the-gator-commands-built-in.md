# The iPhone app has the Gator commands built in, and Google Assistant stays out

Now that the app ships on iOS (ADR 0036), the Gator Shortcuts (ADR 0023) can be built into it with App Intents, so a Member says "Hey Siri, Gator needs" without installing a Shortcut or pasting an Assistant Token. ADRs 0019 and 0023 deferred App Intents for a one-breath "Gator needs milk"; that is still not possible, because an App Shortcut phrase can only hold an AppEntity or AppEnum, never free text. The gain is no setup, not one breath.

## Decision

- **Three built-in commands: "Gator needs", "Gator got" and "Gator, do we have".** Each is an App Shortcut whose intent asks for the dictated text (Siri speaks the same prompt as the Shortcut, such as "What do you need?"), puts the Shortcut's English prefix in front of it, and posts it to `/api/assistant/requests` with the device's local date. Siri speaks the reply's `speech` without opening the app. The API and its contract do not change. "Pantry add" is not built in; installed copies keep working.
- **"Gator" is an alternative app name.** Every App Shortcut phrase must contain the app name, so "Gator" is registered with `INAlternativeAppNames` to keep the documented phrases. If Siri does not honour it on a device, the phrases fall back to "PantryGator needs" and so on. The glossary still avoids "Gator" for the app in our own words.
- **The app holds its own Assistant Token, and only when the Member turns Siri on.** Settings > Siri in the iPhone app has a "Use Siri" switch. Turning it on creates an Assistant Token named for the device (for example "PantryGator app (iPhone)"); turning it off, or signing out, revokes it; a different Member signing in on the phone replaces it. It shows in the token list like any other and can be revoked from anywhere. With no token, the commands answer "Turn on Siri in PantryGator Settings." The endpoint keeps accepting only Assistant Tokens, never the session.
- **The token lives in the Keychain**, readable after the first unlock so Siri works on a locked phone, written through a small plugin of our own in `apps/mobile` (set, clear, has). The session token stays in Preferences (ADR 0036).
- **Phrases in English and Danish.** Siri has no Romanian, so a Romanian Member's Siri runs in English and would transcribe Romanian words badly. Settings > Siri in the app keeps offering the iCloud-link Shortcuts, whose Dictate Text can be set to Romanian, to Members whose Spoken Language is Romanian. The web keeps Settings > Siri as it is. The Android app hides Settings > Siri.
- **Fixed replies for failures the API cannot answer** (no token, revoked token, no network, no `speech`) come from the app, in en, ro and da, following the phone's language.
- **The iOS deployment target rises from 15.0 to 16.0**, the minimum for App Intents. Running without opening the app uses `supportedModes` on iOS 26 and later and `openAppWhenRun` before.
- **Credits and the Assistant Cap are unchanged**: a built-in command is an Assistant Request like any other.
- **Google Assistant and Gemini stay out, for a new reason.** ADR 0019 parked them because there was no Android app. There is one now, and still no way in: App Actions take free text only in en-US and only through classic Google Assistant, which Google is replacing with Gemini; AppFunctions, the replacement, reaches Gemini only in a private preview for selected developers (Android 16 and later); Gemini Connected Apps is a preview limited to the US and English. We apply to the AppFunctions Early Access Program and revisit when it opens.
- **The iOS 27 Siri AI schemas are not adopted yet.** The Reminders schema might take free text in one breath, but Siri AI is beta, needs an iPhone 16 or later and is not available in the EU. Revisit when it reaches Romania.

## Considered options

- **Create the token automatically on sign-in.** Rejected: it would quietly create a credential that applies changes without Review. One tap keeps that the Member's choice and is still far less than installing a Shortcut.
- **Let the endpoint accept the session token.** Rejected: it breaks the rule that the Assistant Request endpoint has its own revocable credential, and voice would stop when the session expires.
- **Keep the token in Preferences.** Rejected: it works with no session at all, so it deserves better storage than the session token.
- **Build all four commands.** Rejected: "Pantry add" was kept only for Members who already installed it.
- **Retire the iCloud-link Shortcuts.** Rejected: web-only iPhone Members and Romanian speakers need them.
- **Prepare AppFunctions now, or ship App Actions.** Rejected: AppFunctions would be code nobody can run until Google admits us, and App Actions are en-US only on a platform being retired.

## Consequences

- The `INAlternativeAppNames` synonym, Danish phrase recognition, the dictation language of the String parameter and Keychain access on a locked phone are unverified and need a device test.
- The iOS project gains Swift code (the intents and the Keychain plugin), so the native projects are no longer only generated Capacitor output.
- `docs/siri-shortcut.md` stays the guide for the iCloud-link Shortcuts; the built-in commands get their own section when they ship.
- This amends ADRs 0019 and 0023 where they defer App Intents and park Google Assistant.

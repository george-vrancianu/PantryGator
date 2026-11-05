# Assistant Requests apply safe Voice Actions without Review

In the shop or the kitchen, with hands full, a Member wants to say "Hey Siri, Pantry add" and have milk on the Shopping List without unlocking the phone. A Voice Note needs the app open, a held-to-talk recording and a Review on screen. An Apple Shortcut can dictate text and call an HTTPS endpoint, so Siri can reach the app. It cannot show Review. This amends ADR 0017, which has every Voice Action confirmed in Review before anything is written.

## Decision

- **Assistant Requests apply an explicit allow-list of safe Voice Action kinds without Review.** The Shortcut sends the dictated text. The API reads it into Voice Actions with the Voice Note reading and matching pipeline (no transcription), applies the allowed kinds at once, refuses the rest, and returns the outcomes plus one sentence for Siri to speak. The safe kinds are adding a Shopping Item (which sets the quantity when one is spoken for an item already on the list, and otherwise leaves it alone) and flagging an Ingredient Running low (which, with no Batch, becomes an add to the Shopping List, as in ADR 0017). Removing, checking or unchecking a Shopping Item, and adding or removing Batches, are refused and reported: a mishearing must never delete or check off anything unseen. A request mixing both applies the safe part. The allow-list is one explicit set, so allowing a new kind is a deliberate edit.
- **Apply can refuse by kind.** Applying Voice Actions takes an optional allowed set. An action outside it is not applied and is reported as refused, with no write. Review never passes a set, so it behaves as before.
- **A separate Assistant Cap.** `ASSISTANT_DAILY_CAP` (default 50) is its own `assistant` usage kind in `scan_usage`, charged before the text-model call and refunded on a provider failure or empty text, like the Scan Cap and Voice Cap. Siri use cannot lock a Member out of Voice Notes.
- **Assistant Tokens, scoped to this one endpoint.** A Member creates tokens in Settings. Each has a name, is shown once, and is stored only as a hash with a short display prefix, a last-used time and a revoked time. It is sent as a Bearer token. The Assistant Request endpoint accepts only a token, never a session cookie, and a token is accepted on no other endpoint, so a leaked token can add to the Shopping List and flag Running low but cannot read, change or delete anything else. Tokens belong to the Member and are deleted with them. The Family is read from the Member on every request, so joining or leaving a Family needs no new token, and signing out of the web app does not affect them.
- **The reply is in the language spoken.** The dictated text is read with no Scan Language: the model is told it may be in English, Romanian or Danish and reports which (`spokenLanguage`), judged by the words around the item names. The spoken sentence is in that language, naming a matched Ingredient by its Catalog name in it (a missing translation falls back as Catalog display names do: English, then the canonical name) and an Unmatched item by a short name in it (`spokenName`). When the language can't be told, or there is no read result (Assistant Cap reached, empty text, nothing understood, not configured, provider failure), the reply is in the Member's UI language. What is written stays in the UI language, as in the app: matching, Shopping Item names and Unmatched names. (Amended by ADR 0022: what is written follows the Catalog Language.)
- **The text is not stored**, like a Voice Note transcript.
- **Google Assistant and Gemini are out of scope.** A web-only app has no way in: there is no Android app for App Actions or AppFunctions to call, Google Assistant no longer takes outside Conversational Actions, and Gemini offers outside developers no hook for a third-party app. Parked until Gemini opens to outside developers. (Amended by ADR 0038: there is an Android app now, and Google still offers no open way in, so this stays parked.)

## Alternatives considered

- **Reply in the UI language.** Rejected: Siri is run in English by Members whose UI is Romanian, who then hear Romanian in an English voice.
- **A reply language chosen per Assistant Token, or sent by the Shortcut.** Rejected: one more setting to keep in step with the Shortcut's dictation language, where reading it from the text needs none.
- **Hold every Assistant Request for Review in the app.** Rejected: it defeats the point of hands-free, and Review would need a queue to wait in.
- **Apply every Voice Action kind.** Rejected: a misheard "take milk off" or "I used the eggs" would change stock or the list with no chance to catch it.
- **Count Assistant Requests under the Voice Cap.** Rejected: a Shortcut called many times could lock the Member out of Voice Notes, and the other way round.
- **Reuse the session cookie, or a general API key.** Rejected: a Shortcut has no browser session, and a token that works anywhere makes a leaked Shortcut a leaked account.
- **A native iOS app with App Intents.** Deferred: a one-shot "add milk to Pocket Pantry" needs a native app we do not have. (Amended by ADR 0038: the iPhone app now has the Gator commands built in, though one breath is still impossible.)
- **Questions answered aloud.** Out of scope here. Pantry Questions were added later by ADR 0020, which also lets an Assistant Token read the Pantry.
- **Two-way sync with Apple Reminders or Google Keep.** Out of scope.

## Consequences

- An Assistant Request costs one text-model call, and no transcription.
- A mishearing is not caught before it is written. Only additions and Running low flags are applied, and a wrong item is removed from the Shopping List as usual, with the existing Undo.
- Reading text and applying Voice Actions are callable on the Voice service on their own, so Voice Notes and Assistant Requests share them.
- The API builds the spoken reply, so it needs localisation in en, ro and da, which it had none of.
- Siri has no Romanian: a Romanian-speaking Member runs Siri in English, so a reply in the UI language would be Romanian read by an English voice. Replying in the language spoken avoids that, and a Member who dictates in Romanian sets the Shortcut's Speak Text language to match.
- The read schema, shared with Voice Notes, carries `spokenLanguage` and a per-action `spokenName`. Voice Notes ignore both.
- The Shortcut is published as an iCloud link by the maintainer, and its build steps are kept in the repo so it can be rebuilt.

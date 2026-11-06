# Building the Siri Shortcuts ("Pantry add" and the Gator Shortcuts)

"Pantry add" is an Apple Shortcut that lets a Member say "Hey Siri, Pantry add", dictate what to add, and hear a one-sentence reply. It sends the dictated text to the API as an Assistant Request (see [ADR 0019](adr/0019-assistant-requests-apply-safe-voice-actions-without-review.md)). Build it on an iPhone or iPad in the Shortcuts app, then share it as an iCloud link.

The iPhone app has these commands built in (Settings > Siri > Use Siri), so the Shortcuts below are for the web and for Members without the app, and for Romanian speakers: Siri has no Romanian, but the Shortcut's Dictate Text can be set to it.

The name of the Shortcut is the Siri phrase, so it is "Pantry add" in every language. Siri's phrase is English; the dictated items can be in any language PantryGator supports.

## The API contract

```
POST <API origin>/api/assistant/requests
Authorization: Bearer <Assistant Token>
Content-Type: application/json

{ "text": string, "today"?: "YYYY-MM-DD" }
```

Response: `{ "outcomes": [...], "speech": string }`. The Shortcut only uses `speech`. `<API origin>` is the deployment's API origin (the same one the web app uses, `VITE_API_URL`, or its own origin when that is unset).

## Actions, in order

1. **Text** (the token). Add a Text action and put the placeholder `Assistant Token` in it. Open the Shortcut's settings (the "i" button) and choose **Setup > Add Import Question** on this Text action. Question: `Paste your Assistant Token`. A Member creates the token in Settings > Siri; the question is asked once, when they add the Shortcut, and the answer is stored in this action.
2. **Dictate Text**. Leave Language at its default (the device language) or pick one specific language; do not use "Ask Each Time", which breaks the hands-free flow under Siri. Dictate Text takes one language per action and one link is shared with every Member, so Members who say items in another language change it after installing (see "After installing" below). Stop Listening: "After Pause" (or "On Tap" if pauses cut dictation short). Prompt: `What should I add?` (the Siri question spoken before listening).
3. **Date**. Leave it on Current Date.
4. **Format Date**. Date: the **Date** variable from step 3. Date Format: **Custom**, format string `yyyy-MM-dd`. This gives the Member's local date in ISO form (`YYYY-MM-DD`), which the API needs to resolve words like "tomorrow".
5. **Get Contents of URL**.
   - URL: `<API origin>/api/assistant/requests`
   - Show More > Method: **POST**
   - Headers:
     - `Authorization` = `Bearer ` followed by the **Text** variable from step 1 (one space after `Bearer`)
     - `Content-Type` = `application/json`
   - Request Body: **JSON**, with two fields:
     - `text` (Text) = the **Dictated Text** variable from step 2
     - `today` (Text) = the **Formatted Date** variable from step 4
6. **Get Dictionary Value**. Get **Value** for key `speech` in the **Contents of URL** result.
7. **If**. Input: the **Dictionary Value** from step 6, condition **has any value**.
   - In the If branch: **Speak Text**, text = the **Dictionary Value** from step 6.
   - In the **Otherwise** branch: **Speak Text**, text = `PantryGator didn't answer. Try again, or check your Assistant Token in Settings.` (a fixed English fallback).
8. **End If**.

The If is needed because some failures have no `speech`: a revoked, unknown or missing token gets HTTP 401, a text over 2000 characters or an invalid body gets HTTP 400, and an unexpected server error gets HTTP 500, all with no `speech`; a network failure returns nothing at all. Without the If, Speak Text would say nothing. As far as we know, Get Contents of URL returns the error body on non-2xx statuses rather than stopping the Shortcut, which is what lets the Otherwise branch run; verify this on a device with a revoked token.

Finally, rename the Shortcut to exactly `Pantry add` (Shortcut name field at the top of the editor, or Rename in the menu). Shortcuts can be run by saying the name after "Hey Siri".

## The Gator Shortcuts

Three more Shortcuts sit beside "Pantry add" (see [ADR 0023](adr/0023-assistant-requests-may-check-shopping-items.md)). All four call the same endpoint with the same contract and the same Assistant Token, so there is nothing to configure on the server and one token works in every one of them. "Pantry add" is kept for Members who already use it.

**How the API tells them apart.** It doesn't: the endpoint has no mode field. The API reads the sentence, so each Shortcut puts its verb in front of the dictated words, and the text model reads what was meant. The allow-list decides what may be applied without Review: adding a Shopping Item, ticking off a Shopping Item that is on the Shopping List and unchecked, and flagging Running low. Unchecking, removing and Batch changes are refused and named in the reply ("Open PantryGator for ...").

Build each as a copy of "Pantry add" (Shortcuts app > duplicate), then change only the three things in its row. The **Text** action is a new action placed right after **Dictate Text**: type the prefix, then insert the **Dictated Text** variable after it, and use this Text action's result (instead of **Dictated Text**) as `text` in the request body in step 5. Every other action (the token Text with its Import Question, Date, Format Date, Get Contents of URL, Get Dictionary Value, and the If with its fallback) stays as in "Actions, in order".

| Shortcut name (the Siri phrase) | Dictate Text prompt         | Text prefix sent             | What the API does                                                                                                                                                                                                             |
| ------------------------------- | --------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Gator needs`                   | `What do you need?`         | `Add to the shopping list: ` | Adds each item to the Shopping List. Replies "Added to your Shopping List: ...".                                                                                                                                              |
| `Gator got`                     | `What did you get?`         | `Got `                       | Ticks off each item that is on the Shopping List and unchecked, and writes nothing else. An item that isn't there (or is already ticked) is never added; the reply says "Not on your Shopping List: ...".                     |
| `Gator, do we have`             | `What are you looking for?` | `Do we have `                | Answers Pantry Questions from the Pantry and Shopping List (see [ADR 0020](adr/0020-voice-notes-and-assistant-requests-answer-pantry-questions.md)); Siri speaks at most 8 Ingredients, then "and N more, check PantryGator". |

Notes:

- The prefix stays English whatever language the Member speaks, like Siri's phrase. The dictated words can be in any language PantryGator supports. The model is told the prefix is Shortcut text, not speech, so the language is judged from the words after it, and the reply comes back in that language (see "After installing").
- With several unchecked lines for the same item (for example in different units), "Gator got" ticks the one in the spoken unit, otherwise the oldest. A spoken amount ("got two milks") is ignored: it never changes a quantity.
- "Pantry add" still adds, flags Running low and answers questions, and now also ticks off an item when the words say so ("got milk"). "Gator got" exists so the phrase fits the intent.
- The old "Pantry check" Shortcut is replaced by "Gator, do we have"; an installed "Pantry check" keeps working because it is the same endpoint. Its link variable `VITE_SIRI_CHECK_SHORTCUT_URL` is retired and no longer read: set `VITE_SIRI_HAVE_SHORTCUT_URL` to the new Shortcut's link, and remove the old variable from each environment.
- **iCloud links are pending.** A maintainer builds the three Shortcuts on an iPhone and shares them (see "Sharing it"). Until then Settings > Siri says "Link coming soon" next to each Shortcut.

## Sharing it

1. In the Shortcut's settings, confirm the Import Question from step 1 is listed under Setup.
2. Set the first **Text** action back to the placeholder `Assistant Token`. Never share with a real token in it: the action's current value is shared as the Import Question's default answer, so a real token would travel in the iCloud link to everyone who imports it.
3. Share > **Copy iCloud Link**. The link carries the actions and the import question (with the placeholder as its default). An iCloud link is a snapshot: after any edit, copy a new link and update the matching variable in each environment: `VITE_SIRI_SHORTCUT_URL` ("Pantry add"), `VITE_SIRI_NEEDS_SHORTCUT_URL` ("Gator needs"), `VITE_SIRI_GOT_SHORTCUT_URL` ("Gator got") or `VITE_SIRI_HAVE_SHORTCUT_URL` ("Gator, do we have").
4. Build the web app with `VITE_SIRI_SHORTCUT_URL=<the iCloud link>` (documented in [apps/web/README.md](../apps/web/README.md)). Settings > Siri then shows the link in its setup steps; while the variable is unset or empty the link is replaced by "Link coming soon". The same goes for the other three variables and their links.

## After installing

To dictate in another language (for example Romanian or Danish; Siri's phrase stays English), open the Shortcut in the Shortcuts app, tap **Dictate Text**, and set **Language** to the language items are said in. The reply comes back in the language you spoke, so also tap **Speak Text**, open **Show More**, and set its **Language** to the same one; otherwise a Romanian reply is read by an English voice.

## When something goes wrong

- A revoked, unknown or mistyped token gets HTTP 401, an invalid body (for example text over 2000 characters) gets HTTP 400, and an unexpected server error gets HTTP 500; none carry `speech`, so the Shortcut speaks the fixed fallback from step 7. Revoke and create tokens in Settings > Siri; to change the token in an installed Shortcut, edit its first Text action.
- Cap reached (429), provider failure (502), nothing understood (200) and "not configured" (503) are answered with a `speech` reply, which the Shortcut speaks as normal.
- With no network there is no response, so the Otherwise branch speaks the fallback (or Shortcuts shows its own error).

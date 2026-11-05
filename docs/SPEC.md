# Pocket Pantry: Wave 1 Spec

Status: agreed 2026-10-01 after a grilling session. Vocabulary follows `GLOSSARY.md`. Visual reference is `pocket-pantry-handoff/HANDOFF.md` and the mockups in `pocket-pantry-handoff/design-source/`.

## Problem Statement

A family buys groceries, puts them away, and forgets what they have. Food expires unnoticed. Shopping lists live in one person's head or in a chat thread nobody updates. Adding what you bought to any tracking app is so tedious that nobody keeps it up.

The retzetar MVP proved that photographing a receipt, a product, a plate, or a pile of ingredients and matching the result to a canonical ingredient catalog works well enough to be useful. But retzetar is single-user, has no notion of a family, and its design was never finished.

## Solution

Pocket Pantry is a mobile-first web app, with iOS and Android apps that package the same web app with Capacitor ([ADR 0036](adr/0036-mobile-apps-wrap-the-web-app-with-capacitor.md)). A Member belongs to one Family. The Family shares a Pantry, a Shopping List, and Family Settings. Groceries enter the Pantry by Scan, by Finish Shopping, or by manual entry, and every entry is matched to the Catalog so the app can reason about what the family actually has. Expiry is tracked per Batch, and Expiring Soon items surface on the Dashboard.

Wave 1 is a vertical slice: auth, Family, Pantry, the four Scan Modes, Shopping List, Dashboard, Family Settings, Admin catalog curation, and full internationalisation. Recipes, alerts, and push come in wave 2. Suggestions on the Shopping List (see Quick List) are not alerts: they are derived at read time and never pushed or stored as notifications.

## User Stories

### Account and Family

1. As a visitor, I want to sign up with email and password, so that I can start using the app.
2. As a visitor, I want to sign in and stay signed in across visits, so that I don't log in every time.
3. As a new Member, I want a Household of One created for me at signup, so that I can use the app alone without any setup.
4. As an Owner, I want to see my Family's Invite Code, so that I can share it with my family.
5. As an Owner, I want to regenerate the Invite Code, so that a leaked code stops working.
6. As a Member, I want to enter an Invite Code to join a Family, so that I share a Pantry and Shopping List with them.
7. As a Member joining a Family, I want a warning that my Household of One and its data will be deleted, so that I don't lose things by surprise.
8. As a Member, I want to see who else is in my Family, so that I know who shares the Pantry.
9. As an Owner, I want to remove a Member, so that someone who left the household no longer sees our data.
10. As a Member, I want to leave my Family and get a fresh Household of One, so that I can start over.
11. As an Owner, I want to transfer ownership to another Member, so that I can leave without stranding the Family.
12. As an Owner, I want to delete the Family and all its data, so that nothing lingers when the household dissolves.
13. As a removed Member, I want to land in a fresh empty Household of One, so that the app keeps working.
14. As a Member, I want to pick my locale (English or Romanian), so that the app speaks my language.

### Catalog

15. As a Member, I want every pantry and shopping entry to be tied to a canonical Ingredient, so that the same thing isn't counted under three names.
16. As a Member, I want Categories granular enough to tell Parmesan from Cheddar, so that matching isn't vague.
17. As a Member, I want to search the Catalog by name in my locale, so that I can add things manually.
18. As a Member, I want Catalog names shown in my locale, so that lists read naturally.
19. As an Admin, I want to create, edit, and delete Ingredients, Categories, Aisles, Synonyms, and translations, and to reorder Aisles, so that I can curate the Catalog and the shop order.
20. As an Admin, I want a list of Unmatched names from Scans and manual entries, so that I can grow the Catalog from real usage.
21. As an Admin, I want to resolve an Unmatched name to an existing or new Ingredient, so that future matches succeed and existing Batches get relinked.

### Pantry

22. As a Member, I want to see my Family's Pantry grouped by Location, so that I can find things where they're stored.
23. As a Member, I want each Ingredient's Batches rolled up with a total quantity and the soonest expiry, so that the list stays readable.
24. As a Member, I want to expand an Ingredient to see each Batch, so that I can act on one purchase.
25. As a Member, I want to search the Pantry by name, so that I can check if we have something.
26. As a Member, I want to filter the Pantry by Location, so that I see only the fridge.
27. As a Member, I want to add a Batch manually with Ingredient, quantity, unit, Location, expiry, and Product Description, so that unscannable things still get in.
28. As a Member, I want the expiry date pre-filled from Default Expiry when I add a Batch, so that I rarely type a date.
29. As a Member, I want the Location pre-filled from the Ingredient's Category when possible, so that I rarely pick it.
30. As a Member, I want to edit a Batch's quantity, expiry, Location, and description, so that I can correct mistakes.
31. As a Member, I want to delete a Batch, so that used-up or thrown-out food disappears.
32. As a Member, I want Batches with an expiry date sorted soonest first, so that I use things before they go off.
33. As a Member, I want an Expiring Soon marker on Batches inside the Stale Threshold, so that I notice them.
34. As a Member, I want quantity and expiry to be optional, so that I can add "some garlic" without lying about numbers.

These stories were added with the Empty Pantry and Add sheet work (spec #604) and number on from the end of the list.

89. As a Member with an empty Pantry, I want the page to show me the quickest ways to fill it (scan, speak, type, or move what I ticked while shopping), so that I can get started without hunting for buttons.
90. As a Member, I want to add a Batch by photographing the product or scanning its barcode, so that the Ingredient, pack size and product name are filled in for me.
91. As a Member, I want to add several things by hand one after another without the form closing, so that stocking up by hand is fast.

### Scanning

35. As a Member, I want to open the camera in any of the four Scan Modes, so that I pick the right recognition for what's in front of me.
36. As a Member, I want to choose a photo from my gallery instead of the camera, so that I can scan a receipt I photographed earlier.
37. As a Member, I want a Product Scan to propose one Ingredient Match, Product Description, and best-before date, so that one item takes seconds.
38. As a Member, I want a Receipt Scan to propose one line per purchased item with quantity, unit, and Match, so that a whole shop goes in at once.
39. As a Member, I want non-food receipt lines excluded with a reason, so that I don't get a Batch of "carrier bag".
40. As a Member, I want a Receipt Scan to tick off Shopping Items that match what I bought, so that the list updates itself.
41. As a Member, I want an Ingredients Scan to propose a Match for each loose item it sees, so that produce without packaging gets in.
42. As a Member, I want a Plate Scan to guess the dish and list its Ingredients for one serving, so that I can add what I'm missing to the Shopping List.
43. As a Member, I want every Scan to land on a Review screen, so that nothing enters the Pantry or list without my say.
44. As a Member, I want to change a proposed Match on the Review screen by searching the Catalog, so that wrong guesses are cheap to fix.
45. As a Member, I want to edit quantities, units, expiry, and Location on the Review screen, so that the saved Batch is right.
46. As a Member, I want to drop any line from the Review screen, so that I only save what I want.
47. As a Member, I want a low-confidence or Unmatched line to be visibly flagged on the Review screen, so that I check it first.
48. As a Member, I want to save an Unmatched line anyway with the name the scan read, so that a thin Catalog doesn't block me.
49. As a Member, I want to be told when I've hit my daily Scan Cap, so that I know why the shutter stopped working.
50. As a Member, I want Scans to work on Romanian receipts and labels, so that my shop in Romania is recognised.

This story was added with the same work (spec #604).

92. As a Member adding to my Pantry by hand, I want a barcode I scan from the Add sheet to be confirmed on a card before it fills the sheet, so that a misread costs one tap, not a trip back.

### Shopping List

51. As a Member, I want to see my Family's Shopping List grouped by Aisle in shop order, so that I walk the shop once.
52. As a Member, I want to add a Shopping Item by typing a name and picking the Catalog Match, so that the list stays canonical.
53. As a Member, I want to set a quantity and unit on a Shopping Item, so that whoever shops knows how much.
54. As a Member, I want to check and uncheck a Shopping Item, so that the family sees what's in the basket.
55. As a Member, I want to remove a Shopping Item, so that changed minds don't clutter the list.
56. As a Member, I want to see which Source Recipes added an item, so that I know why it's there.
57. As a Member, I want the list to refresh itself while open, so that I see what my partner just added.
58. As a Member, I want a summary of how many items remain and how many are checked, so that I know how far through the shop I am.
59. As a Member, I want to Finish Shopping and have checked items become Batches with Default Expiry, so that putting things away is one tap.
60. As a Member, I want to review the Batches Finish Shopping is about to create, so that I can set Locations and fix quantities before saving.
61. As a Member, I want a fresh empty list after Finish Shopping, so that the next shop starts clean.

### Quick List

These stories were added on 2026-10-10 after a grilling session and number on from the end of the list.

79. As a Member, I want to mark an Ingredient as a Staple, so that the app knows we always want it in stock.
80. As a Member, I want to set a preferred quantity and unit on a Staple, so that adding it to the list needs no typing.
81. As a Member, I want to manage our Staples on one screen, and toggle a Staple from a Pantry Ingredient row or a Shopping Item, so that keeping the list current is cheap.
82. As a Member, I want missing Staples suggested at the top of the Shopping List, so that we don't run out of things we always need.
83. As a Member, I want Ingredients we recently Used Up suggested on the Shopping List, so that rebuying what we finished is one tap.
84. As a Member, I want to add a Suggestion with one tap, so that building the list is fast.
85. As a Member, I want to dismiss a Suggestion for the Family, so that something we don't need right now stops showing until it is restocked and runs out again.
86. As a Member, I want a Suggestions Widget on the Dashboard, so that I see missing Staples without opening the list.
87. As a Member, I want to create named Shopping Templates, from scratch or from the current Shopping List, so that recurring shops are reusable.
88. As a Member, I want to apply a Shopping Template through a picker where items already in the Pantry start unticked, so that I only add what we lack.

### Dashboard

62. As a Member, I want a Dashboard of Widgets as my home screen, so that the most useful information is one glance away.
63. As a Member, I want a Use Soon Widget showing the three soonest-expiring Batches, so that I plan around them.
64. As a Member, I want a Shopping Widget showing how many items are left to buy, so that I know whether to go shopping.
65. As a Member, I want a Pantry Stock Widget showing total items by Location, so that I see what's where.
66. ~~As a Member, I want a Quick Scan Widget with the four Scan Modes, so that scanning is one tap from home.~~ Dropped: the Dock already puts Scan one tap away.
67. As a Member, I want to add, remove, reorder, and resize Widgets, so that the Dashboard fits me.
68. As a Member, I want my Dashboard layout saved to my account, so that it follows me between devices.
69. As a Member, I want a Meal plan Widget showing a column for each planned day from today (up to 7), with a bar per Mealtime coloured by whether the Pantry covers it, a day popover, and one tap to add what's missing to the Shopping List, so that I see how the week's plan holds up. Budget and Nutrition Widgets stay placeholders until those features exist (see Meal Plans, #324, and [ADR 0012](adr/0012-meal-plans-are-saved-family-schedules.md)).

### Family Settings

70. As a Member, I want to see and change Default Expiry per Category for my Family, so that our fridge's reality overrides the defaults.
71. As a Member, I want to set the Stale Threshold, so that "expiring soon" means what we want it to mean.

### Internationalisation

72. As a Member, I want every screen, button, error, and empty state in my locale, so that nothing is half-translated.
73. As a Member, I want dates, numbers, and units formatted for my locale, so that they read correctly.
74. As a Member, I want Catalog names in my locale and the other locale's names still matched, so that scanning a Romanian receipt into an English-locale account works.

### Admin and operations

75. As an Admin, I want my role granted from configuration at signup, so that no manual database edit is needed.
76. As an operator, I want a per-Member daily Scan Cap set by configuration, so that a leaked session can't drain the AI budget.
77. As an operator, I want a one-command local setup with Postgres in Docker, so that any machine can run the stack.
78. As an operator, I want a seed command that loads the Catalog and sample data, so that a fresh database is usable.

## Implementation Decisions

### Repository and stack

- npm-workspaces monorepo with three packages: a web app, an API, and a shared UI package. The mobile apps live in `apps/mobile` and package the web build ([ADR 0036](adr/0036-mobile-apps-wrap-the-web-app-with-capacitor.md)).
- The API and the UI package start as copies of the equivalent retzetar packages, renamed, with git history not carried over. Specifically copied: the NestJS on Fastify server, the Drizzle schema and migration tooling, better-auth integration with email and password, the structured-output AI service and its OpenAI configuration, the four scan services and their schemas and specs, the catalog matching validator, the receipt quantity normaliser, client image resizing, the typed fetch wrapper, and the MUI theme wrapper.
- The web app is built fresh to the handoff: React, TypeScript, Vite, React Router, TanStack Query for server state, Zustand only for client-only state such as the in-progress Review.
- Node version matches retzetar. Package scope is `@pocket-pantry`.
- Postgres runs in Docker Compose locally. No deployment in wave 1. When there is one, the API must run as a single instance: the Plate token uses and the Invite Code rate limiter are in memory (see `apps/api/README.md`).
- All business logic lives in the API. The web client renders, validates input, and calls endpoints. This keeps any future second client thin.

### Design and UI

- The handoff wins on layout, tokens, routes, component names, screen behaviour, responsive rules, and accessibility. `start.md` wins on stack and code structure.
- The UI package is a Material UI based component library themed with the handoff's tokens and fonts. Components are organised by atomic design (atoms, molecules, organisms). Storybook is configured but no stories are written in wave 1.
- Web pages live under a pages directory, one directory per page named without the Page suffix, containing a main component with the Page suffix plus `hooks` and `components` subdirectories.
- Routes: dashboard at root, customise, pantry, shopping, scan, plus settings, family, and admin routes not in the handoff. Recipes route exists as a placeholder screen in wave 1 so the Dock matches the design.
- The barcode mode is not built in wave 1. Product Scan is image-based. Barcode Lookup was added later; see [ADR 0013](adr/0013-barcode-lookup-is-not-a-scan.md).

### Auth and Family

- better-auth with email and password only. Sessions as in retzetar. The mobile apps send the session as a Bearer token ([ADR 0036](adr/0036-mobile-apps-wrap-the-web-app-with-capacitor.md)).
- Every Member belongs to exactly one Family, created at signup as a Household of One with the Member as Owner. There is no nullable family anywhere in the data model.
- Family has one Owner. All Members have equal read and write on Family data. Owner-only actions: regenerate Invite Code, remove Member, transfer ownership, delete Family.
- Invite Code: 8 characters from an unambiguous uppercase alphanumeric alphabet, reusable until it expires 7 days after generation. Regenerating revokes the previous code. Redeeming requires the code to be unexpired and the redeemer not to be in that Family already.
- Redeeming a code moves the Member to the target Family and deletes their previous Family, which must be a Household of One they own. The client shows a warning naming what will be deleted. Data is not merged.
- Leaving a Family or being removed creates a fresh Household of One for that Member. An Owner cannot leave until ownership is transferred. Deleting a Family cascades to its Pantry, Shopping Lists, Settings, and memberships; each former Member gets a fresh Household of One.
- Admin is a role on the Member. Signup never grants it, and no endpoint does: it is set directly in the database (see README). It is independent of Family ownership.

### Catalog

- Two-level Categories. Retzetar's 18 categories become Parent Categories. Each Parent Category has an Aisle with a sort order. Admins create, rename, translate, reorder (move up or down) and delete Aisles; an Aisle a Parent Category still uses cannot be deleted. Leaf Categories hang under Parents. Every Ingredient belongs to exactly one Leaf Category.
- Default Expiry in days lives on the Leaf Category, nullable, falling back to the Parent Category. A default Location is on the Leaf Category, nullable, falling back to the Parent, used to pre-fill new Batches.
- Ingredient and Category rows carry a canonical English name and a normalised key. A translations table keyed by entity, locale, and kind holds display names and Synonyms per locale. Uniqueness is enforced on the normalised canonical name and on normalised display names within a locale.
- Each Ingredient has a default unit from the unit enum.
- The seed is generated once with an LLM from the 18 parents, producing Leaf Categories and Ingredients with English and Romanian names and Synonyms, then reviewed by hand before being committed as seed data. Seed rows have fixed identifiers so re-seeding is idempotent and keeps Admin edits, Aisle names and shop order included; a seed Aisle an Admin deleted comes back, last in the shop order if its slot is taken.
- An "Other" Leaf Category exists under every Parent Category, plus a top-level "Other" Parent, so Unmatched Batches always have a home.
- Unmatched names are recorded in a review queue with the raw text, locale, source (which Scan Mode or manual), and the Batch or Shopping Item they were saved on. Admin resolution either links to an existing Ingredient or creates a new one, then relinks the referencing rows and adds the raw text as a Synonym. A relinked Shopping Item on the active list merges with an existing line for the same Ingredient and a compatible unit (the same, or g/kg, ml/l, converted into the existing line's unit, as when adding); on archived lists it only relinks. Unmatched rows saved before the queue existed (migration 0009) are not queued; that is dev data only and no backfill is provided.

### Matching

- Matching has two stages. Stage one is deterministic: normalise the input (case, diacritics, punctuation, whitespace; the Danish letters æ, ø, å fold to the receipt spellings ae, oe, aa) and look up against canonical names, display names, and Synonyms across all locales. An exact hit is a confident Match. Stage two, used for images and for stage-one misses, is the retzetar approach: the vision model receives the Catalog in the Member's locale and returns a matched Ingredient identifier, a Leaf Category guess, a confidence, and a fallback name. The validator rejects identifiers not in the Catalog.
- Confidence below a configured threshold, or no identifier, marks the line as Unmatched on the Review screen. The Member can still save it.
- Manual entry in Pantry and Shopping uses stage one only, with a Catalog search box as the primary interaction.

### Units and quantities

- Unit enum: g, kg, ml, l, pcs. Packs, bunches, and similar are pcs with the pack size in Product Description.
- Quantity is a decimal number, nullable. Unit is nullable only when quantity is null.

### Pantry

- A Batch belongs to a Family and an Ingredient and has quantity, unit, Location, expiry date (date only, nullable), Product Description, an Unmatched flag with the raw name, and a created-at timestamp. One row per purchase; nothing is merged.
- Pantry read endpoints return Batches grouped by Ingredient with totals and soonest expiry, and support filtering by Location and searching by localised name.
  - Wave 1 deviation: the roll-up and search run client-side in `apps/web/src/lib/pantry.ts` and the API returns Batches. See [ADR 0002](adr/0002-pantry-rollup-and-search-client-side.md).
- Expiring Soon is computed from the Family's Stale Threshold at read time, not stored.
- An Empty Pantry (no Batches at all, Expired ones included) shows an empty state instead of the list: dimmed Location chips, a bar to move checked Shopping Items into the Pantry (Finish Shopping, through `/shopping?finish=1`, which opens the Review once the Shopping List has loaded and then drops the parameter) when there are any, a Gator banner with Scan (camera on Receipt), Say it (lights the Dock mic without disabling the tabs) and Type (Add sheet), and one empty card per Location whose "+" opens the Add sheet with that Location preset for every pick, camera picks included. The header holds only the "+" (ADR 0027). Deleting the last Batch shows the empty state as soon as the row is gone, while its Undo toast is up; Undo brings the list back.
- In a Pantry that has Batches, a Location filter with none shows that Location's empty card instead of "No batches match."
- Manual add is a bottom sheet that replaces the inline add-Batch form, and every entry to that form (the header "+", "Add batch" on an Ingredient card) opens it. Before a pick it offers Take a photo (camera on Product), Scan barcode (camera on Barcode), Say it, the Catalog search, and Recently Stocked tiles (or Popular to start, a fixed list per locale, when there are none) with aisle chips. After a pick, one card holds amount, Location (the Catalog default marked; with none, Cupboard and no mark) and expiry (Usual = Default Expiry, quick picks, or the expiry sheet); the Product Description is a note, folded, and open only when the camera read a note. Changing the Location does not change the Default Expiry. Saving keeps the sheet open for the next item and lists what was added; each add's toast offers Undo, which deletes only that Batch.

### Scanning

- Images are resized client-side as in retzetar and sent as data URLs. The API forwards them to the AI provider and never stores them.
- The AI provider stays OpenAI via the existing provider abstraction and environment variables.
- Each Scan Mode has its own endpoint, returning the same shape of proposed lines so one Review screen serves all four modes. Receipt and Ingredients return many lines, Product returns one, Plate returns a dish guess plus lines for one serving.
- The Review screen is client state until the Member confirms. Confirming calls a bulk-create endpoint for Batches (Product, Receipt, Ingredients) or a bulk-add endpoint for Shopping Items (Plate). Each line carries its Match or its Unmatched raw name.
- Receipt confirmation also returns which Shopping Items on the active list matched the saved Batches, and the client ticks them.
  - Known limit: a Shopping Item ticked by a receipt is still checked on the list, so Finish Shopping proposes it again as a Batch. A Member who confirmed the receipt Batches should drop that proposed Batch at Finish Shopping. Not prevented in wave 1.
  - A failed tick does not undo the save; Review tells the Member how many Shopping Items were not ticked (removed from the list, or the list changed).
- The Scan screen is a full-screen, non-scrolling, always-dark camera view (it stays dark in the light theme), using the `cam-*` camera palette, laid out like the iOS Camera app. The camera feed is aspect-filled behind everything, under a radial vignette, and runs under two semi-transparent glass bars (`cam-glass` with a 14 pt blur): a top bar and a footer. The top bar holds Close on the left, and the torch button (hidden when the camera has no torch), the Scan Language chip and Info on the right. The footer holds, from top to bottom, the shutter row (the photo stack on the left, the shutter in the middle, Import on the right) and the mode slider, above the bottom safe area. Manual entry is not offered here; it lives on the Pantry. The chip shows the Scan Language code, starting at the Member's Scan Language preference, and opens a menu of English, Română and Dansk in that order. A pick overrides the Scan Language for the rest of the Scan Session without changing the preference (ADR 0022). It is sent with each following Scan, including photos added from Review, and it is locked while a photo is being prepared. The chip is hidden in Plate and Barcode, which have no Scan Language.
- Camera modes are picked on a text slider at the bottom of the footer, in the order Receipt, Ingredients, Product, Barcode, Plate, written in capitals (Barcode is a camera mode, not a Scan Mode, ADR 0016); the selected name is centred and accent-coloured and the strip fades at both edges. Dragging the slider or the camera view sideways moves the strip with the finger (after 10 pt of mostly horizontal travel; past either end it follows at 35 %) and settles on the nearest mode on release, or one step for a quick short flick; the guide shrinks slightly while dragging and the settle animation is off under reduced motion. Tapping a name or pressing the left and right arrow keys also changes mode (stopping at the ends; the keys do nothing while a sheet or the language menu is open, or focus is in a field), with a light haptic where the browser supports it and a screen-reader announcement. The slider is a radio group. The last-used mode is remembered on the device; with none, or an unknown one, Receipt opens. A `?mode=` link wins and becomes the last-used mode. The Info sheet lists the five camera modes with a one-line description each, Receipt with its framing and folding tips; the camera screen itself shows no mode description.
- Every Scan Mode has a guide of four L-shaped corner brackets, centred horizontally and placed in the clear area between the two bars, 14 pt above its middle, sized as a fraction of the screen width and of the clear area's height: Receipt 0.56 x 0.78, Product 0.62 x 0.56, Ingredients 0.88 x 0.50, Plate 0.80 x 0.60, Barcode 0.80 x 0.30. It morphs to the new size over 400 ms when the mode changes (no animation under reduced motion). The guide is a framing aid only and takes no input. The shutter takes the Scan: a round button in the middle of the footer, activated by a tap, Enter or Space. Holding it runs the best-effort focus pass and letting go takes the Scan (ADR 0015). In Barcode, which reads codes on its own, the shutter is replaced by a ring with a barcode glyph that takes no input, the Import button is hidden, and each accepted code's frozen frame flies into the photo stack. It is disabled while a photo is being prepared, while the camera is not ready, at the Scan Session limit and while the Scan Cap blocks scanning. A camera Scan never waits for an earlier one to be read. A Scan flashes the screen white (55 % fading out over 280 ms, gone by 420 ms), flashes the guide's inside (85 % over 420 ms), thickens the brackets from 3.5 to 6 pt for the flash and pulses the guide to 0.965 scale for 360 ms, with a 12 ms haptic where supported, then the cropped photo flies into the photo stack over 460 ms; under reduced motion the flash, fill, pulse and fly animations are dropped, while the bracket change to 6 pt (white) and the haptic remain. No hint is shown under the guide; the Info sheet explains the modes. In Barcode a scan line sweeps inside the guide (static at the middle under reduced motion, briefly hidden after each code is read), on the Scan page and in the Add sheet's camera. A receipt camera frame is cropped to the guide by mapping it through the feed's cover scaling and is sent at the crop's aspect, at most 512 px wide. The Add sheet's camera (Product and Barcode, for Prefill) opens over the sheet without leaving the Pantry, uses the same top bar, shutter and slider with no photo stack, and shows "Adds to your Pantry" with a Scan several action that closes the sheet and opens the Scan page in the same mode. It is single-shot: a Product photo that reads returns to the sheet with the Ingredient picked, the pack size as the amount and the product name as the Product Description. A read barcode shows a result card (Scan again / Use this, with the Open Food Facts credit when the data came from there). An unknown barcode offers Take a photo (switches to Product) or Type it, and the code goes with the Batch either way, so it becomes a Known Barcode.
- Info opens a bottom sheet explaining scanning. Tab stays inside the sheet; Escape, a scrim tap or the sheet's button closes it and returns focus to Info. The camera keeps running while it is open.
- Scan Session (ADR 0004). A camera Scan in any Scan Mode joins an in-memory Scan Session at once and the camera stays ready for the next; its photo is read in the background over the Scan Mode's endpoint, in the Scan Mode and Scan Language it was taken in, and reads run 2 at a time in the order the Scans were taken. A Plate Scan joins the Scan Session the same way (a gallery Plate photo too): its photo is read for dish guesses, with no Scan Language, and the Review overview card shows them under "Pick the dish" with each guess's confidence. Picking one loads its Ingredients for one serving into the card (the count and chips like any other card), and the card opens the line editor, which adds the lines to the Shopping List. The Plate token behind the guesses lasts an hour; when it has expired the pick fails and the card offers "Read again", which queues the same photo for a new read (a new Plate request). Any other pick error is shown on the card and the guesses stay. The Scan Session lives in client state only: a reload loses it, and it survives leaving the Scan screen for Review and coming back with the Camera link. The photo stack left of the shutter shows the last three cards fanned, newest on top, with the number of cards (Scans and Barcode Lookups) as a badge: amber with a spinner while any Scan waits or is read, amber while any gallery receipt still needs crop, amber with "!" while any Scan has failed, and accent green once all are read. With an empty Scan Session it is a dashed placeholder and does nothing. A network error is retried once automatically; any other failed read (or a photo with nothing in it) leaves the Scan in the Scan Session as failed: its Review card offers "Read again", which reads the same photo again (a failed Barcode card offers "Look up again"), except for errors a retry cannot change (too many items, photo too large or invalid, nothing found), which show their reason and offer no retry. The Scan Cap fails the Scan the same way and fails the Scans still waiting behind it with it, shows "Daily scan limit reached" (also on the overview card) and disables scanning until a capped Scan is retried (which re-queues them all) or removed; Add is not held up by them. The camera requests 1080p in every Scan Mode, so the mode slider never restarts the stream. A camera photo that cannot be prepared never joins the Scan Session and shows a toast. The Import button right of the shutter (a photo icon with a "+" badge) adds the picked files (several at once, in every Scan Mode) to the Scan Session as one Scan each, in the current Scan Mode; they are read in the background like camera Scans and the Member stays on the camera. It also works when camera permission is denied. A gallery receipt is not read on the Scan screen: its card in Review has a Crop button that opens the receipt cropper (Crop receipt dialog); Use photo crops it, sends it and reads it, Cancel leaves it uncropped. Until cropped it counts as not yet read (the stack badge stays amber, Review does not say all read) but Add waits on it as "Crop N receipts first", not as a read, and a failed crop shows an error on the card and keeps the Crop button.
- Tapping the photo stack opens `/scan/review`, even while reads are running; it is disabled with an empty Scan Session. There is no Done button.
- `/scan/review` is the overview: the subtitle reads "N photos · M still reading" or "N photos · all read", the Camera link returns to the camera with the Scan Session intact, and each Scan, in the order the Scans were taken, is a card with its Scan Mode as the eyebrow, a result line (the product name for Product, "N items" otherwise), the items read as chips, and "Check N items" when N lines are low-confidence or Unmatched. The list ends with two buttons: "Take more" returns to the camera with the Scan Session intact, and "Add from photos" opens the file picker and adds the picked files to the Scan Session in the last-used Scan Mode (Product when the last-used camera mode was Barcode), as new cards at the end, without leaving Review. A Scan still being read shows "Reading photo…" and cannot be removed; a read card has a remove button. A failed Scan is a card that says "Couldn't read, retake" (with the reason for the errors a retry cannot change, or "Daily scan limit reached"), has no result, can be removed, and has a "Retake" button that removes the card and returns to the camera. Removing, merging and splitting move focus to the neighbouring or resulting card. Tapping a read card opens `/scan/review/:scanId`, the existing Review for that Scan. Saving there commits only that card, through the bulk Batch endpoint (Product, Ingredients) or Receipt confirm (Receipt), in the Scan's Scan Language, and removes the card; the Member returns to the overview, or lands on the Pantry when it was the last card. Discarding there removes the card the same way. The editor writes its edits back to the card, so going back keeps them; merging keeps them too, but Split restores the sections as they were read. A card that is gone or still being read sends `/scan/review/:scanId` back to the overview. A read Receipt card below another read Receipt card has "Merge with previous": the two become one card (the upper one keeps its photo and Scan Language; the lines are joined in order), up to 10 sections per card; a merged card has "Split", which restores the separate cards in place, and removing a merged card removes all its sections. Saving a merged card is one Receipt confirm.
- Scan Session lifecycle. The overview has "Add all" and "Discard all". Add is disabled while any Scan is waiting or being read and then reads "Add all (waiting on M)", or "Crop N receipts first" while only uncropped receipts are left; a failed read is not waited on, not counted and is dropped by Add. Add saves each read card, one request per card in the order the Scans were taken, through the same path as that card's line editor (Batch bulk, Receipt confirm, or the Shopping List for Plate), in the card's Scan Language. It tries every card: a card with no lines left to save is dropped, a card with more than 50 lines or an invalid value stays with that reason, and a card whose save fails stays with its translated error; a later Add retries them. When every card saved, the Scan Session is emptied and the Member returns to `/scan` with a toast "Added results from N photo(s)" (N counts cards, a merged receipt is 1; plus a warning when Shopping Items could not be ticked) centred 170 px above the bottom. Discard all empties the Scan Session without saving and returns to `/scan`.
- A Scan Session holds at most 20 Scans: a 21st Scan is refused with a toast naming the limit and adds nothing to the photo stack; gallery picks are capped the same way (photos still being prepared count), and Split is refused when it would pass the limit. A merged card saves under its first section's Scan Language. Close asks "Discard N photos?" when the Scan Session has Scans and, if agreed, empties it and goes home.
- A per-Member daily Scan Cap, from configuration, is enforced in the API before calling the provider. Exceeding it returns a specific error code.

### Shopping

- A Family has one active Shopping List at a time, plus archived ones. A Shopping Item references an Ingredient (or an Unmatched raw name), quantity, unit, checked flag, and zero or more Source Recipe references. The recipe reference is nullable-free in wave 1 because no recipes exist, but the join table is created now.
- Adding an item for an Ingredient already on the list merges into the existing item, summing quantities when units agree. Lines in g/kg or ml/l merge too, summed in the existing line's unit; other differing units stay as separate lines.
- Reads return items grouped by Aisle in Aisle sort order. The client polls on an interval and refetches on window focus.
- Finish Shopping takes the checked items, returns a proposed list of Batches with Default Expiry and default Location, lets the Member adjust on a Review screen, then creates the Batches, archives the list, and creates a new empty one in a single transaction.

### Quick List

Staples, Used Up Suggestions, and Shopping Templates make adding Shopping Items fast. All three are Family data, and any Member may edit them.

- **Staples.** A Staple references a Catalog Ingredient (never an Unmatched name) and has an optional preferred quantity and unit. At most 200 per Family. A Staple is missing when the Family has no Batch of that Ingredient that is unexpired: an expired Batch counts as missing, an Expiring Soon Batch counts as present. Quantity is ignored, so there is no minimum-stock threshold.
- **Used Up.** Batches are hard-deleted and the Pantry keeps no history, so a per-Family, per-Ingredient stock history row records when the Ingredient was last stocked and when its last Batch was removed. See [ADR 0005](adr/0005-used-up-from-stock-history.md). An Ingredient is Used Up when its last Batch was removed within the past 30 days, it has no Batches now, and it is not a Staple. Deleting a Batch less than 10 minutes after it was created does not make the Ingredient Used Up, so mistaken entries do not become Suggestions. Unmatched Batches have no Ingredient and are not tracked until an Admin resolves them.
- **Suggestions.** The API derives Suggestions on read: missing Staples first, then Used Up Ingredients, each group in Aisle order. A Suggestion is hidden while its Ingredient is on the active Shopping List, checked or not. Adding a Staple Suggestion uses the Staple's preferred quantity and unit when set. Adding a Used Up Suggestion adds no quantity. Adding goes through the normal add endpoint and its merge rule. Nothing is ever added automatically.
- **Dismissal.** Dismissing a Suggestion hides it for the whole Family until a new Batch of the Ingredient is created and it then goes missing or Used Up again. There is no timed snooze. To stop suggesting a Staple for good, the Member removes the Staple.
- **Where Suggestions show.** A collapsible Suggestions section at the top of the Shopping List, and a new `suggestions` Dashboard Widget with the missing-Staples count and the first few Suggestions. No badges elsewhere.
- **Shopping Templates.** A Shopping Template has a name and up to 100 lines. Each line is an Ingredient or an Unmatched name with optional quantity and unit, the same shape as a Shopping Item. At most 50 per Family. A Template is created from scratch or by saving the current Shopping List. Archived lists cannot be read yet, so they cannot be saved as Templates.
- **Applying a Template.** A picker lists the lines grouped by Aisle. Lines whose Ingredient is present in the Pantry (as for Staples, an unexpired Batch) start unticked. Unmatched lines and missing Ingredients start ticked. The ticked lines are added through the existing bulk-add endpoint, all or none, and merge with the list by the usual rule: quantities sum when units agree (g/kg and ml/l included, summed in the existing line's unit).
- **Provenance.** Items added from a Staple, a Suggestion, or a Template carry no source marker. Source Recipe stays recipe-only.
- **Catalog curation.** When an Admin resolves an Unmatched name, Unmatched Shopping Template lines are relinked along with Batches and Shopping Items, and relinked Batches update the stock history. A Staple or a Template line keeps an Ingredient in use, so the Admin cannot delete it (`catalog.ingredient_in_use`). Stock history rows do not, and are deleted with the Ingredient.

### Dashboard

- Widget layout is per Member, stored as an ordered list of widget instances with type and size, persisted via the API as in retzetar's dashboard table.
- Wave 1 widget types: Use Soon, Shopping, Pantry Stock, Suggestions (see Quick List), the Meal plan Widget (real, see #324), and the placeholder Budget and Nutrition widgets with static content. Cook Tonight and Recipe of the Day are wave 2.
- Customise screen uses dnd-kit for reorder, with size toggle, remove, and an add gallery, as in the handoff.

### Settings

- Family Settings hold per-Category Default Expiry overrides and the Stale Threshold, default 3 days. Any Member may edit.
- Member Preferences hold locale and are per Member.

### Internationalisation

- Launch locales are English and Romanian with English as fallback. i18next with react-i18next, JSON resource files per locale, namespaced per page and per shared component. Dates, numbers, and units formatted with the Intl API.
- The API never returns user-facing strings. Errors carry a stable code and structured parameters; the client translates. Validation errors follow the same rule.
- Catalog display names come from the translations table in the requested locale, falling back to English.

### Tooling and process

- GitHub Actions on every pull request: lint, typecheck, test, build. Husky pre-commit with lint-staged formatting and typecheck.
- Work is broken into tracer-bullet tickets on GitHub Issues. Implementation agents use cheaper models, work on branches, and open pull requests. Fable reviews every pull request. Fable merges routine tickets. The user merges the foundation ticket and any pull request touching the database schema or auth.

## Testing Decisions

A good test exercises external behaviour through a stable seam and would survive a rewrite of the internals. Tests do not reach into private state or assert on implementation structure.

Seams, highest first:

- **API HTTP seam.** Integration tests boot the NestJS app against a test Postgres, sign in as a seeded Member, and call endpoints. This is the primary seam for Family rules, Pantry grouping, Shopping merging and Finish Shopping, Scan confirmation, Scan Cap, and admin resolution of Unmatched names. In wave 1 Pantry grouping is the exception: it is client-side and covered by unit and component tests (see [ADR 0002](adr/0002-pantry-rollup-and-search-client-side.md)). The AI provider is replaced at the structured-output service boundary with a fake returning canned structured results.
- **Scan service seam.** The ported scan services keep their retzetar specs, which exercise schema parsing and catalog validation with a fake provider. New tests are added for the matching stage one and for Ingredients and Plate, which retzetar left untested.
- **Web page seam.** Component tests render a page with the API client mocked at the network boundary and assert on what the Member sees and can do: Review screen editing, Finish Shopping review, Customise reorder, locale switching. No tests for the UI package atoms beyond what Storybook will later cover.

Prior art: retzetar's receipt scan service spec and missing-ingredients spec on the API, and its add-pantry page test and photo picker test on the web.

No end-to-end browser tests in wave 1.

## Out of Scope

- Recipes, favourites, Want to Cook, cook confirmation with Pantry deduction, recipe suggestions from Ingredients Scan, user recipes from Plate Scan.
- Alerts and notifications, in-app or push: anything pushed to a Member or stored as a notification. The notifications table is not created in wave 1. Suggestions (see Quick List) are derived at read time and are not alerts.
- Progressive web app installability, service worker, offline.
- Barcode scanning and external product databases (since added; see [ADR 0013](adr/0013-barcode-lookup-is-not-a-scan.md)).
- Multiple Families per Member, merging Pantries on join.
- Multiple named Shopping Lists. Shopping Templates are not Shopping Lists: applying one adds items to the single active list.
- Unit conversions between mass, volume, and count.
- Budget tracking and nutrition as real features. Their Widgets are static placeholders.
- Image storage.
- Deployment and hosting.
- Mobile apps (now planned in [ADR 0036](adr/0036-mobile-apps-wrap-the-web-app-with-capacitor.md)).

## Further Notes

- The handoff describes Plate Scan as "logs the meal and takes what you used out of the pantry." That is the wave 2 cook-confirmation flow. In wave 1, Plate Scan follows retzetar and adds the dish's Ingredients to the Shopping List. The Scan screen copy for Plate should describe the wave 1 behaviour.
- The handoff's localStorage data model is a prototype shape, replaced by the API model above.
- Pantry Location was not in `start.md` and comes from the design. It is a Batch field with Category-driven defaults.
- The Catalog seed generation is a one-off task with human review, not application code. It should be its own ticket early, since Pantry, Shopping, and Scan all depend on it.
- The to-tickets step needs the issue tracker configured for this repo via the setup skill before tickets can be published.

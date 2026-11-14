# PantryGator

A kitchen app for a person or a family: scan groceries into a shared pantry, keep a shared shopping list, and (later) cook from recipes that match what you have.

## Language

### People

**Member**:
A signed-in person who belongs to exactly one Family.
_Avoid_: User (when the family relationship matters), account

**Family**:
The group that owns a Pantry, a Shopping List, and Family Settings. Every Member belongs to exactly one.
_Avoid_: Household, group, team

**Household of One**:
The Family with a single Member, created automatically at signup unless the Member joins a Family there with an Invite Code, and again whenever a Member leaves a Family, is removed from it, or the Family is deleted.
_Avoid_: Solo family, personal account

**Owner**:
The single Member of a Family who can remove Members, regenerate the Invite Code, transfer ownership, and delete the Family.
_Avoid_: Admin (reserved for the catalog role), creator

**Invite Code**:
A short, reusable, expiring code that lets a Member join a Family.
_Avoid_: Invite link, token

**Admin**:
A Member with the app-operator role: curating the Catalog and issuing Promo Codes. Unrelated to Family ownership. Never granted at signup; set directly in the database.
_Avoid_: Owner, superuser

### Catalog

**Catalog**:
The set of Ingredients and Categories that everything in the app matches against. A Family sees the shared Catalog plus its own Family Ingredients.
_Avoid_: Ingredient list, dictionary, taxonomy

**Ingredient**:
A named entry in the Catalog, such as "Parmesan", either shared by every Family or a Family Ingredient. Not a product and not a Batch.
_Avoid_: Item, product, food

**Family Ingredient**:
An Ingredient a Member added for their Family, visible only to that Family, until an Admin promotes it to the shared Catalog. It sits in a Leaf Category like any other Ingredient.
_Avoid_: Custom ingredient, private ingredient

**Parent Category**:
A top-level grouping of the Catalog, such as "Dairy". Carries the Aisle.
_Avoid_: Department, group

**Leaf Category**:
A granular grouping under a Parent Category, such as "Hard cheese". Every Ingredient belongs to exactly one.
_Avoid_: Subcategory, type

**Aisle**:
The ordered shop section a Parent Category maps to. Used to group the Shopping List, in the shop order Admins set.
_Avoid_: Section, department

**Synonym**:
An alternative name for an Ingredient in a given Scan Language, used for matching. Unlike display names, Synonyms are not limited to the catalog locales. A Family Synonym is one a Member added, matching only for their Family.
_Avoid_: Alias, keyword

**Default Expiry**:
The number of days after purchase a Batch of an Ingredient is assumed to last, taken from the Leaf Category, falling back to the Parent Category, and overridable per Family.
_Avoid_: Shelf life

**Amount Scale**:
How a catalog Ingredient is bought: low, medium or large, which decides its Usual Amounts.
_Avoid_: pack size, bucket

**Usual Amount**:
A quick-pick quantity offered under the amount field once a unit is chosen, from the Ingredient's Amount Scale or, when there is none, from the unit alone.
_Avoid_: Preset, suggestion (a Suggestion is a Shopping term), chip

**Unmatched**:
The state of a scanned or typed name, on a Batch or an Ingredient Line, that could not be matched to an Ingredient with confidence. Both are queued for Admin curation; Unmatched Batches are saved under an "Other" Leaf Category.
_Avoid_: Unknown, custom, uncategorised

**Pantry Basic**:
An Ingredient Admins flag as always at hand, such as water, salt, or black pepper. Recipe matching treats its Ingredient Lines as covered and never adds them to the Shopping List on its own; a Member can still add one by hand.
_Avoid_: Staple (a Family's always-wanted Ingredient), essential, cupboard item

**Allergen**:
A substance some people react to, such as peanuts, milk, or gluten, from a fixed list Admins curate and translate, starting from the EU's 14 major allergens. Admins tag each shared Ingredient with the Allergens it contains, and Members tag their Family Ingredients. A Recipe's Allergens are those of its Ingredient Lines, derived at read time and never stored or tagged on the Recipe.
_Avoid_: Allergy (a Member's own), intolerance, trigger

**Unchecked**:
The state of an Ingredient Line whose Allergens are not known: an Unmatched name, or a Family Ingredient no Member has tagged yet. Ticking "no Allergens" on a Family Ingredient counts as tagging it. A shared Ingredient is not Unchecked either: no tags means it contains none. The one exception is a shared Ingredient promoted from Family copies none of which were checked; it stays Unchecked until an Admin saves its Allergens.
_Avoid_: Unknown, untagged, unverified

**Ingredient Icon**:
The picture shown for an Ingredient wherever it appears, coloured by its Aisle. Several Ingredients may share one, and an Ingredient without one shows the Default Icon. Belongs to the Ingredient, never to a Product Description.
_Avoid_: product icon, category icon, thumbnail

**Default Icon**:
The generic Ingredient Icon for an Ingredient that has none of its own, and for Unmatched names.
_Avoid_: placeholder, fallback tile

### Pantry

**Pantry**:
A Family's inventory of Batches.
_Avoid_: Inventory, stock, fridge

**Empty Pantry**:
A Pantry with no Batches at all. A Pantry holding only Expired Batches is not empty.
_Avoid_: New Pantry, blank Pantry

**Batch**:
One purchase of one Ingredient in the Pantry, with its own quantity, expiry date, Location, and optional product description.
_Avoid_: Pantry item, entry, stock line

**Location**:
Where a Batch is stored: fridge, freezer, cupboard, or spices.
_Avoid_: Storage, place

**Recently Stocked**:
The Ingredients a Family most recently added to the Pantry, newest first, whether or not they are still in it.
_Avoid_: Recent, history, favourites

**Popular to start**:
A fixed list of eight Ingredients per locale that the Add to Pantry sheet offers when the Family has no Recently Stocked ones.
_Avoid_: Suggestions, trending

**Product Description**:
The free-text name of the actual product a Batch came from, such as "Grana Padano 200g", kept alongside the matched Ingredient. The UI calls it the note.
_Avoid_: Label, brand

**Expired**:
A Batch whose expiry date is before today. A Batch that expires today is not yet Expired, and a Batch with no expiry date never is. Derived at read time, never stored on the Batch.
_Avoid_: Stale, gone off, past date

**Expiring Soon**:
A Batch that is not Expired and whose expiry date is at most the Family's Stale Threshold days away, today included. Derived at read time from the expiry date and the current threshold, never stored on the Batch; a Batch with no expiry date is never Expiring Soon.
_Avoid_: About to go stale, going off

**Stale Threshold**:
The Family Setting for how many days before expiry a Batch counts as Expiring Soon.
_Avoid_: Warning window

**Pantry Health**:
A 0–100 score of how well a Family's Pantry is kept, weighted from four Health Factors; a Health Factor with nothing to measure is left out and the others share its weight. Derived at read time, never stored, and not given while the Pantry holds fewer than ten Batches.
_Avoid_: Health score, pantry score, rating

**Health Factor**:
One of the four parts Pantry Health is weighted from: Fresh, Supply, Dated and Rotation, each 0–100.
_Avoid_: Check (a Shopping Item is checked), metric, component

**Supply**:
The Health Factor for whether a Family has what it uses, judged per Ingredient over every Ingredient with an unexpired Batch and every missing Staple. A Running low or missing Ingredient lowers it, and less so once it is on the Shopping List.
_Avoid_: Stock, Staples (as a Health Factor)

**Health To-do**:
A set of Batches or Ingredients that lower Pantry Health and that one action fixes, such as the Expired Batches to toss or the missing Staples to add. Derived at read time, never stored; a dismissed Suggestion never appears in one.
_Avoid_: Task, alert, issue

**Forgotten**:
A Batch with no expiry date that has been in its Location longer than that Location's limit. Giving it an expiry date means it is no longer Forgotten. Derived at read time, never stored.
_Avoid_: Stale, old, unchecked

### Shopping

**Shopping List**:
A Family's single active list of Shopping Items, grouped by Aisle.
_Avoid_: Cart, basket

**Shopping Item**:
One Ingredient wanted on the Shopping List, with a quantity, a checked state, and zero or more Source Recipes.
_Avoid_: Cart item, line

**Source Recipe**:
A Recipe whose missing ingredients added a Shopping Item. Always a specific Base Recipe or Variant. One Shopping Item may have several.
_Avoid_: Recipe tag, origin

**Finish Shopping**:
The action that moves checked Shopping Items into the Pantry as Batches with Default Expiry, after a Review, archives the list, and starts a new one that carries over the unchecked items. The button that starts it may read "Move N to Pantry"; the action is still Finish Shopping.
_Avoid_: Move to pantry (as a name for the action), checkout, complete

**Staple**:
An Ingredient the Family always wants in stock, with an optional preferred quantity and unit. A Staple with no unexpired Batch in the Pantry is missing and becomes a Suggestion.
_Avoid_: Must-have, favourite, essential

**Shopping Template**:
A named, reusable list of Ingredients or Unmatched names, each with an optional quantity and unit, that a Member applies to the Shopping List. Not a Shopping List: applying it adds Shopping Items to the one active list. Several Shopping Templates, whole or line by line, can be applied in one go; the button that does it may read "Import", but the action is still applying.
_Avoid_: Predefined list, saved list, preset, import (as a name for the action)

**Template Line**:
One Ingredient or Unmatched name in a Shopping Template, with an optional quantity and unit. Applying the Shopping Template turns each Template Line into a Shopping Item.
_Avoid_: Template item, entry

**Used Up**:
The state of an Ingredient whose last Batch was removed from the Pantry within the past 30 days. A Staple is never Used Up; it is missing instead.
_Avoid_: Run out, finished, nothing left

**Running low**:
A manual flag a Family sets on an Ingredient it is nearly out of, while the Ingredient still has at least one Batch. Per Family, never set automatically from quantities; cleared when a Batch is added or the last Batch is removed. Turning it off is the only way to clear it from the Running low Suggestions. Lowers Supply whether or not the Ingredient is a Staple.
_Avoid_: Low stock, almost out, low quantity

**Suggestion**:
A proposed Shopping Item, from a missing Staple, a Used Up Ingredient, a Running low Ingredient, or an Ingredient whose Batches are all Expired, that is not on the Shopping List yet. Derived at read time, never added automatically. Dismissing a missing Staple, Used Up or Expired Suggestion hides it for the Family until the Ingredient is restocked and runs out again; a Running low Suggestion has no dismissal, and it leaves when its flag is turned off. Not to be confused with plate matches: the closest Catalog Base Recipes offered on New Recipe when it is filled from a Plate Scan.
_Avoid_: Alert, notification, recommendation

### Scanning

**Scan**:
A photo sent for recognition. One of four Scan Modes.
_Avoid_: Capture, upload

**Scan Session**:
The Scans and Barcode Lookups a Member takes from opening the camera until they are added or discarded. It is held in the app, in memory, and each Scan in it is read in the background while the Member keeps scanning. Each Barcode Lookup in it is one card, looked up at once.
_Avoid_: Batch (a Batch is a Pantry purchase), queue

**Scan Mode**:
Product, Receipt, Plate, or Ingredients.

**Product Scan**:
Recognises a single packaged product from one photo, and its best-before date when the date is in that photo.

**Barcode Lookup**:
Reading a product's barcode in the camera and looking the code up, first among the Family's Known Barcodes and then in an open product database. It fills the Add to Pantry sheet, or adds a card to a Scan Session. Not a Scan: no photo is sent for recognition, it has no Scan Language, and it never counts against the Scan Cap. Barcode sits on the camera's mode slider but is not a Scan Mode.
_Avoid_: Barcode scan, barcode mode

**Lookup Limit**:
How many Barcode Lookups per minute may reach the open product database: a few per Member, and a total for the whole app that is a little higher but still under the database's own published limit, counted over the last minute rather than in fixed minutes. Only a lookup that really goes out is counted; a Known Barcode or a recently seen code is answered without counting. A Member over it is asked to wait a minute and try again; the lookup is not reported as not found.
_Avoid_: Scan Cap (that limits Scans)

**Known Barcode**:
A barcode a Family has saved a Batch from, remembered with the Ingredient, or the Unmatched name, and the Product Description it was saved as. The latest save wins. A Product Scan's photo teaches one too: the barcode on it is decoded on the device, and goes with the Batch when the card read as exactly one line.
_Avoid_: Barcode cache, saved product

**Prefill**:
Filling the add-Batch form from a Product Scan or a Barcode Lookup. It fills only the fields the Member has not touched, and the Member still saves the Batch themselves.
_Avoid_: Autofill, auto-add

**Receipt Scan**:
Recognises every purchased line on a receipt photo.
A long receipt can be scanned across several photos, one per **Receipt Section**: the Member folds the receipt about every 20 items and photographs each fold. In Review the sections are joined into one card with "Merge with previous" (and undone with "Split"); each counts as one Scan against the **Scan Cap**. It is still one Receipt Scan of one receipt.

**Receipt Section**:
One photo of a folded part of the same receipt. It is read as one **Scan**, and in Review its card is merged with the card of the previous section (up to 10 sections).

**Scan Language**:
The language the printed text in a Scan is read in: English, Romanian, or Danish. Defaults to the Member's Scan Language preference, which follows the UI Language until the Member sets it, and can be changed for one Scan Session without changing the preference. Independent of the UI Language and the Catalog Language. Plate Scans and Barcode Lookups have none.
_Avoid_: Scan locale, source language

**Plate Scan**:
Recognises a cooked dish from a photo as up to five guessed dish titles, then writes the one the Member picks as a whole Recipe: Ingredient Lines, Steps and Tips, for the Servings the dish usually makes. The written Recipe is made up, not read from any source, and is kept as a Recipe Draft that the Member finishes on New Recipe; nothing becomes a Recipe until they save it. Guidance is left for Suggest Guidance. A Plate Scan has no Review and never adds to the Shopping List; a Member shops for the dish from the saved Recipe. Picking none of the guesses leaves only the photo paid for.
_Avoid_: Dish scan, plate review

**Ingredients Scan**:
Recognises loose ingredients laid out in a photo.

**Match**:
The link from a scanned or typed name to an Ingredient, with a confidence.
_Avoid_: Mapping, resolution

**Review**:
The screen where a Member confirms, edits, or discards results before anything is saved: Scan results, the Voice Actions of one Voice Note or of several merged from the Voice Inbox, or the Batches proposed for the checked Shopping Items when Finishing Shopping. For a Scan Session it is an overview with one card per Scan; opening a card edits that Scan's lines, and saving commits that card alone.
_Avoid_: Confirm sheet, preview

**Scan Cap**:
The maximum number of Scans a Member may run per day.
_Avoid_: Quota, rate limit

### Voice

**Voice Note**:
A short recording a Member makes from the Dock on any page that shows it, read into Voice Actions and Pantry Questions. Not a Scan: nothing is photographed, and it counts against the Voice Cap, never the Scan Cap.
_Avoid_: Voice scan, voice command, dictation

**Voice Inbox**:
The Voice Notes a Member has recorded but not yet applied or discarded. It is held in the app, in memory, and each Voice Note in it is read in the background while the Member keeps recording. Each one is reviewed on its own, or every one that has been read is reviewed together in one merged Review. Each Voice Note keeps the Default List and Spoken Language it was recorded with.
_Avoid_: Stack, queue, Voice Session

**Default List**:
The list a Voice Note's Voice Actions target when they name none: the Shopping List when recorded on the Shopping List, the Pantry when recorded on the Pantry or during Setup, and none on any other page. With no Default List, a Voice Action counts as naming a list when the Member says one or gives a clear cue, such as a Location or expiry date for the Pantry, or "need" or "buy" for the Shopping List; otherwise the Member picks the list in Review. An Assistant Request always has the Shopping List as its Default List.
_Avoid_: Target, context, current list

**Spoken Language**:
The language a Voice Note is spoken in: the Member's Spoken Language preference, which follows the UI Language until the Member sets it. A Voice Note that failed or heard nothing can be read again in another language. Not the Scan Language: a Member may speak their own language while shopping in the local one. An Assistant Request has none; its language is told from the dictated text.
_Avoid_: Voice language, Scan Language (for Voice Notes)

**Voice Action**:
One change read from spoken or dictated text: adding, removing, checking or unchecking a Shopping Item or setting its quantity, adding or removing Batches, or flagging an Ingredient Running low. From a Voice Note, nothing is applied until the Member confirms it in Review. An Assistant Request may apply a Voice Action without Review, but only the safe kinds: adding a Shopping Item, ticking off an unchecked Shopping Item already on the list (a name that matches none writes nothing and is said aloud), and flagging an Ingredient Running low. Every other kind is refused.
_Avoid_: Command, intent, voice line

**Pantry Question**:
A spoken or dictated question about whether named Ingredients are in the Pantry, such as "Do we have milk and butter?", read from a Voice Note or an Assistant Request alongside its Voice Actions. It is answered, never reviewed or applied, and changes nothing. Each answer is yes (with quantity, Location, Expiring Soon and Running low), only expired, no (saying whether it is on the Shopping List), or not sure, never "no" for a name that did not match.
_Avoid_: Glance, stock check, query

**Voice Cap**:
The maximum number of Voice Notes a Member may record per day.
_Avoid_: Voice quota, Scan Cap (a separate limit)

**Assistant Request**:
Text a Member dictates to a voice assistant (today only Siri: through a Shortcut the Member installs, or through a phrase built into the iPhone app) and that sends to the API with an Assistant Token. It is read into Voice Actions like a Voice Note, but the safe ones are applied at once with no Review and the rest are refused. The reply is one sentence for the assistant to speak, in the language the Member spoke (the UI Language when that can't be told); what is written follows the Catalog Language. Not a Voice Note (no recording, no transcription) and not a Scan; the text is not stored.
_Avoid_: Siri command, assistant call, Voice Note, Gator (the mascot, even when a Siri phrase names it)

**Assistant Cap**:
The maximum number of Assistant Requests a Member may make per day. Separate from the Voice Cap and the Scan Cap, so using Siri never locks a Member out of in-app Voice Notes.
_Avoid_: Assistant quota, Voice Cap (a separate limit)

**Assistant Token**:
A secret a Member creates in Settings, with a name such as "George's iPhone", and pastes into the Shortcut; or one the iPhone app creates when the Member turns Siri on, and revokes when they turn it off or sign out. It authenticates as a Bearer token on the Assistant Request endpoint only, and is accepted nowhere else. It belongs to the Member, not to a Family, and is shown once; only a hash is stored. A Member can have several and revoke each separately.
_Avoid_: API key, session, login

### Recipes

**Recipe**:
Something a Member can cook, with its own ingredients and steps. Either a Base Recipe or a Variant.
_Avoid_: Dish, meal

**Base Recipe**:
A Recipe with no parent, such as "Omelette". Cookable on its own, and the starting point its Variants branch from.
_Avoid_: Category, recipe family, parent recipe

**Variant**:
A Recipe that branches from exactly one Base Recipe, such as "Mediterranean omelette" or "Frittata". A Variant never has Variants of its own.
_Avoid_: Sub-recipe, version, child recipe

**Catalog Recipe**:
A Recipe curated by Admins and shared by every Family, browsed in Explore. Members can preview it, shop for its missing Ingredients and make Variants of it, but they cook and plan it only once they Add it to Family, and never change it.
_Avoid_: Global recipe, built-in recipe

**Explore**:
Browsing the Catalog Recipes to preview them, Add them to Family or make Variants of them. A Family's own Recipes are not in it.
_Avoid_: Catalog browser, discover, library

**Add to Family**:
Copying a Catalog Recipe into a Family Recipe that remembers which Catalog Recipe it was Copied From. The copy is the Family's to change, and later Admin edits to the Catalog Recipe never reach it. A Family has at most one live copy of each Catalog Recipe; a Variant made from a Catalog Recipe is not a copy.
_Avoid_: Import, save (as the name of the action), clone, adopt

**Family Recipe**:
A Recipe owned by one Family, which its Members can edit and delete. Either a Base Recipe or a Variant, possibly of a Catalog Recipe.
_Avoid_: Custom recipe, my recipe, user recipe

**Recipe from Link**:
Reading a recipe from a web page a Member links to ("From a link"), or from recipe text they paste in ("From text"), into a new Family Recipe in our own format. Both are the same read; only how the Member starts it differs. It is read in the background while the Member carries on, and a finished read is kept as a Recipe Draft; nothing becomes a Recipe until the Member saves it. Only what the source states is filled in; Guidance is never made up while reading, though the Member can Suggest Guidance on the filled page afterwards. Not a Scan and not a Shopping Template being applied.
_Avoid_: Recipe import, clip, scrape

**Recipe Draft**:
A Member's unsaved New Recipe or new Variant, kept automatically so they can finish it later, on any device. Private to that Member, and not a Recipe: it is never browsed, matched, planned or shopped from, only resumed or discarded. Saving it makes the Recipe and ends the Recipe Draft.
_Avoid_: Draft Recipe, unsaved recipe, draft (alone)

**Recipe Ideas**:
Asking for dishes the Pantry's Ingredients could make, optionally starting from one Recipe, offered as several Ideas to pick from. The picked Idea becomes a Recipe Draft, a new Variant when it started from a Recipe, which the Member finishes; nothing becomes a Recipe until they save it. The Ideas are made up, not read from any source, and by default leave out dishes the Family already has or the Pantry can already make from the Catalog.
_Avoid_: Generate recipe, Ask Gator, AI recipe, enhance, fork

**Idea**:
One dish offered by Recipe Ideas, written for the Servings the dish usually makes. It uses the Ingredients of the Pantry's unexpired Batches (every selected one, when the Member selects some), Pantry Basics, at most two named extras from outside the Pantry, and, for a new Variant, its Base Recipe's Ingredients. Expiring Soon Batches are preferred, quantities are ignored, and it never uses an Ingredient containing the Member's own or a Family Allergy unless the Member selected it. Not a Recipe and not a Recipe Draft until the Member picks it.
_Avoid_: Suggestion (a proposed Shopping Item), generated recipe

**Wish**:
Optional short text a Member adds to Recipe Ideas to steer the Ideas and the Recipe written from the picked one, such as "vegetarian, no oven". It can only narrow what Recipe Ideas may offer, never loosen it, and it is not stored.
_Avoid_: Note (a Voice Note or Nutrition Note), request (an Assistant Request), prompt, hint

**Source Link**:
The web page a Family Recipe was read from by Recipe from Link, kept on the Recipe and shown as where it came from, with the source language when the Recipe was translated. A Member can remove it but not change it, and a Variant made from the Recipe does not copy it.
_Avoid_: Source Recipe (a Recipe that added a Shopping Item), origin, URL

**Link Cap**:
The maximum number of Recipe from Link reads a Member may make per day, pasted text included. A link that could not be read, or held no recipe, does not count. Separate from the Scan Cap, Voice Cap and Assistant Cap.
_Avoid_: Import quota, Scan Cap (a separate limit)

**Tag**:
A label on a Recipe that helps Members find it, such as breakfast, keto, or Mediterranean. A Recipe can have up to 10 Tags. Either a Catalog Tag or a Family Tag. A diet Tag such as keto is a claim, never checked against the Recipe's Ingredient Lines.
_Avoid_: Label, category, Cuisine, Method, region

**Catalog Tag**:
A Tag Admins curate and translate, offered to every Family and the only kind a Catalog Recipe carries. Each belongs to a Tag Group. Never an allergen-free claim such as gluten-free; Allergens cover that.
_Avoid_: Global tag, built-in tag, predefined tag

**Family Tag**:
A Tag a Member created for their Family, visible only to that Family and never translated. It belongs to no Tag Group.
_Avoid_: Custom tag, user tag, my tag

**Tag Group**:
An Admin-curated heading Catalog Tags are listed under, such as Meal, Diet, Cuisine, or Method.
_Avoid_: Tag category, tag type

**Tip**:
A short piece of cooking advice attached to a Recipe or to one of its steps. It doesn't change the dish.
_Avoid_: Pro tip, hint, note

**Servings**:
The number of people a Recipe's quantities are written for. A Member can pick another number on the Recipe, and quantities scale in proportion.
_Avoid_: Portions, yield

**Ingredient Line**:
One ingredient of a Recipe: an Ingredient (or, on a Family Recipe, an Unmatched name), an optional quantity and unit, an optional preparation note, and whether it is optional.
_Avoid_: Recipe item, component

**Step**:
One ordered instruction in a Recipe, optionally with a timer. Step Tips attach to a Step.
_Avoid_: Instruction, direction

**Can Make**:
A Recipe whose required Ingredient Lines are all covered by the Pantry's unexpired Batches. Optional lines and Pantry Basics never block it.
_Avoid_: Cookable, available, in stock

**Cook Tonight**:
The Family Recipes a Family's Pantry can make now, or with one required Ingredient Line short, one per Base Recipe, best match first. Catalog Recipes the Pantry can make are shown in Explore instead.
_Avoid_: Suggestions, what to cook, use it up

**Pairing**:
A food or drink that goes well with a Recipe, with a reason why. It may link to a Catalog Ingredient or another Recipe.
_Avoid_: Match, side, suggestion

**Pairing Principle**:
The general rule behind a Pairing, such as acid cuts fat or salt balances sweet. Optional, from a fixed list.
_Avoid_: Flavour rule

**Nutrition Note**:
A short, free-text recommendation on how nourishing a Recipe is, covering both the good and the bad, such as "Rich in protein and filling; fairly high in fat from the butter and cheese." A general direction, never values.
_Avoid_: Macros, nutrition facts, calories

**Eating Moment**:
A time or situation for eating, such as Morning, After a workout, or Before bed, from a list Admins curate and translate. A Recipe marks each Eating Moment it uses as Good for or Avoid, with an optional reason. Not a Tag such as breakfast, which only helps find a Recipe.
_Avoid_: Occasion, timing, Mealtime (Breakfast, Lunch, or Dinner in a Meal Plan)

**Guidance**:
A Recipe's Pairings, Nutrition Note and Eating Moments together: what it goes with, how nourishing it is, and when it suits. Not its Tips, which advise on cooking it.
_Avoid_: Metadata, extras, details

**Suggest Guidance**:
Asking for Guidance to be proposed from what a Recipe's page currently holds, saved or not, by a Member on a Family Recipe or an Admin on a Catalog Recipe in the language being edited. Only empty fields are filled, each marked as suggested, and nothing is stored until it is saved; once saved it is ordinary Guidance, chosen by whoever saved it. A field with nothing worth proposing is left empty.
_Avoid_: Suggestion (a proposed Shopping Item), auto-fill, enrich, AI fill

**Guidance Cap**:
The maximum number of Suggest Guidance requests a Member may make per day. A request that returns nothing usable does not count, and Admins have none. Separate from the Link Cap, Scan Cap, Voice Cap and Assistant Cap.
_Avoid_: Link Cap (a separate limit)

### Meal planning

**Meal Plan**:
A Family's saved schedule of Recipes over 1 to 7 consecutive days from a chosen start date, laid out in Plan Slots. Days already past stay visible.
_Avoid_: Menu, schedule, weekly plan

**Mealtime**:
Breakfast, Lunch, or Dinner: the fixed parts of a day a Meal Plan is laid out in. Not an Eating Moment, which says when a Recipe suits rather than when it is planned, and not a breakfast or lunch Tag.
_Avoid_: Meal, Eating Moment, course

**Plan Slot**:
One Mealtime on one day of a Meal Plan, holding a Recipe and the Servings to cook it for. A Plan Slot can have its own Servings, otherwise it follows the Meal Plan's.
_Avoid_: Meal, entry, cell

**Plan Forecast**:
Whether each Plan Slot from today onwards will still be covered by the Pantry, once the earlier Plan Slots have used up their ingredients and Batches have expired by that day. It carries on across consecutive Meal Plans. After the first use, a line whose amount can't be judged because a Batch has no quantity or a unit of another dimension is uncertain and doesn't make its Plan Slot short, and a Plan Slot whose Recipe has been archived is unavailable and left out. Derived at read time, never stored.
_Avoid_: Projection, simulation, availability

### Lists

**Undo window**:
The 5 seconds after a Member removes a row from a list ([ADR 0009](docs/adr/0009-row-delete-is-deferred-until-undo-expires.md)), during which Undo puts it back. The delete is only sent when the window ends.
_Avoid_: Grace period, trash

**Row hint**:
The one-time pill and peek that teach a list's swipe and hold gestures, shown once per list and remembered on the device. Not a Tip, which is cooking advice on a Recipe.
_Avoid_: Tutorial, onboarding

### Credits

**Credit**:
The unit a Family spends to use the app's AI reads: Scans, Voice Notes, Assistant Requests, Recipe from Link reads and Suggest Guidance. Belongs to the Family, so every Member spends from the same Credits. A read is charged only when it succeeds, whether or not its result is saved; a read that fails or finds nothing costs none. Admin work on Catalog Recipes never costs Credits. Not a Cap: a read must be within its Cap and paid for in Credits.
_Avoid_: Token (an Assistant Token is a secret), coin, point, quota

**Credit Balance**:
The Credits a Family has left, seen by every Member with the recent reads that spent it and by whom. It never goes below zero: a read is paid for when it starts and given back if it fails, so a read whose Credit Price is more than what is left is refused at once, and a read already started always finishes.
_Avoid_: Wallet, allowance

**Credit Price**:
What one successful read costs in Credits: 1 for a Scan (each Receipt Section counts), 1 more for writing a Plate Scan's picked dish as a Recipe, a Voice Note, an Assistant Request, Suggest Guidance or pasted recipe text, and 2 for reading a recipe from a web page. Barcode Lookups are free. Set by the app and changed as Usage Records show what reads really cost.
_Avoid_: Fee, rate

**Credit Grant**:
Credits added to a Family by the app rather than spent, always with a reason. The Welcome Grant and a redeemed Promo Code are two; others are given by hand.
_Avoid_: Top-up, purchase, refund

**Welcome Grant**:
The 100 Credits a Member brings once in their life, paid into the Family they belong to when they sign up, but only while signing up needs no Promo Code; while it does, the Promo Code's Credits take its place. A Household of One made later, when a Member leaves, is removed, or their Family is deleted, starts with none. A Member who joins a Family brings their Household of One's Credits with them; one who leaves leaves theirs behind. Every Family that existed when Credits began got one too.
_Avoid_: Starting balance, free credits, bonus

**Promo Code**:
A single-use code an Admin issues, worth a set number of Credits (100 unless the Admin picks another, possibly none), with an optional note. Redeemed once, ever, by one Member: at signup, where it is what lets a new Family be created while signing up needs one, or later in Settings by any Member. Its Credits go to the redeemer's Family. An unused one can be revoked; it never expires.
_Avoid_: Voucher, coupon, Invite Code (joins a Family, reusable)

**Usage Record**:
What the app keeps about one call to an AI provider: which read it served, for which Member and Family, and what it cost in money. One read can make several, such as a Voice Note's transcription and reading. Kept for the app's own accounting, even after a Family is deleted; never shown to Members and never a Credit.
_Avoid_: Credit (what the Family pays), log, expense

### Intro

**Gator**:
The app's mascot, an alligator who speaks the app's own lines in the first person. A character, not a feature: what Gator says describes only real features. A feature's own name and status shown beside him, even in his speech bubble, are the app's labels, not Gator speaking.
_Avoid_: Assistant, bot, AI

**Intro**:
The screens a new Member goes through once, after which they land on the Dashboard: choosing their languages, creating an account, and an optional Setup. Shown once per Member, never again on another device.
_Avoid_: Onboarding, tutorial, walkthrough, welcome flow

**Setup**:
The two optional tries in the Intro, a Scan Session and a Voice Inbox, each taken from the real Dock and saved through the real Review. Either can be skipped. Whatever the Member leaves unsaved when they carry on goes with them into the app.
_Avoid_: Demo, practice, trial

### Dashboard

**Dashboard**:
A Member's personal home screen made of Widgets.
_Avoid_: Home, overview

**Widget**:
A card on the Dashboard showing one slice of Family data, with a type and a size.
_Avoid_: Card, tile, panel

### Settings

**Family Settings**:
Settings shared by all Members of a Family: Default Expiry overrides per Category and the Stale Threshold.
_Avoid_: Preferences (reserved for per-Member settings)

**UI Language**:
The language a Member sees the app's own text in: menus, buttons, messages, and how dates and numbers are written. Says nothing about the language of Catalog names, what the Member speaks, or what they scan.
_Avoid_: Locale, app language

**Catalog Language**:
The language a Member sees everything Admins curate and translate in: Ingredients, Categories, Aisles, Allergens, Eating Moments and Catalog Recipes. Names the AI makes up for Unmatched lines, Plate Scan dish titles, Ideas, and the Recipes written from either, are in it too. Follows the UI Language until the Member sets it, so a Member can use an English UI with Romanian Ingredient names. Family Ingredients, Family Recipes and typed Shopping Items keep the one language they were written in.
_Avoid_: Product language, name language, locale

**Member Preferences**:
Settings private to a Member: UI Language, Catalog Language, Spoken Language, Scan Language, Theme, Dashboard layout, and whether to hide Recipes containing their Allergies.
_Avoid_: Settings

**Allergy**:
An Allergen a Member has said they must avoid, intolerances included. Each Member sets only their own, and every Member of their Family can see them. Not a Member Preference, because it is not private.
_Avoid_: Allergen (the catalog entry), dietary restriction, intolerance

**Family Allergy**:
An Allergy the Family records for someone who is not a Member, such as a child, with an optional label like "Mia". Any Member can add or remove one, and it counts as every Member's own Allergy.
_Avoid_: Shared allergy, household allergy

**Allergy Warning**:
The notice on a Recipe that contains an Allergy: stronger when a required Ingredient Line contains it, softer when only optional or Unchecked lines might. It names whose Allergy it is, the viewer's own and Family Allergies first. Recipes are hidden, when a Member chooses to, only for their own and Family Allergies in required lines, and only from browsing and matching, never from a Recipe's own page.
_Avoid_: Alert, allergy badge

**Theme**:
The app's look, one of Warm editorial (`warm`, the default), Minimal crisp (`minimal`) and Dark-first (`dark`). A Member Preference, so it follows the Member across devices.
_Avoid_: Skin, colour scheme (MUI's mechanism behind a Theme), mode

**Match system**:
A per-device switch that makes the app follow the device's dark mode: Dark-first in dark mode, the Member's chosen light Theme in light mode (Warm editorial if they chose Dark-first). Stored on the device, not a Member Preference.
_Avoid_: Auto theme, system theme

# Recipes — design handoff (list + detail)

Status: approved designs, ready for implementation. Date: 2026-10-12.
Reference prototypes (self-contained HTML, open in a browser; the same files are live as Claude artifacts):

- `recipes-list-prototypes.html` — list page, **Variant C "Cook tonight first"** is the chosen one (the other two are kept for context). Live: https://claude.ai/artifact/QDsuQDKHpFtxRtVm5e92KF
- `recipe-detail-prototypes.html` — detail page, **Variant B "Tabs"** is the chosen one. Live: https://claude.ai/artifact/Vqe85xKL3ojgdCYg6uVX29

The prototypes are the source of truth for look, spacing and interaction; the numbers below are copied from them. Both pages use the app's existing light tokens (`packages/ui/src/theme/themes.ts`) and fonts (Bricolage Grotesque display, DM Sans body); nothing new is introduced at token level.

Code touched: `apps/web/src/pages/Recipes/*` (`RecipesPage.tsx`, `RecipeDetailPage.tsx`, `components/*`), `apps/web/src/lib/recipes.ts`, `apps/web/src/lib/cookTonight.ts`, `apps/web/src/i18n/locales/*/recipes.json`.

---

## Decisions (2026-10-12)

Agreed in a grilling session after the handoff. **Where these differ from the sections below, these win.**

Recipes list:

- **§1.2 / §1.3 strip holds Can Make Recipes only.** Drop the `canMake === false` tile (white surface + "Missing {ingredient}" status line). The strip is hidden when no card has `canMake`. Near-misses still show as the "Missing {name}" pill on their list row (§1.5), from the same cook-tonight data.
- **§1.2 "+" (New Recipe)** opens a new `/recipes/new` page: the family-recipe form reused from Make a Variant, starting blank, `POST /recipes` with `parentId: null` (the API already supports it). "+" ships with that page.
- **§1.5 status pills only for cook-tonight hits** is accepted. Match status on every row (browse endpoint returns match data) is a later follow-up.
- **§1.6 hint** "Search or pick a filter to see Variants on their own." is kept.

Recipe detail:

- **§2.2 "…" menu**: a new `ActionMenu` molecule in `packages/ui` (wrapping MUI `Menu`: focus, Escape, outside click, reduce-motion), placed through `AppScreenHeader`'s `trailing` slot (`action` is a single button).
- **§2.3 tabs**: a new `SegmentedTabs` molecule (or `variant="tabs"`) with the `SegmentedControl` look but `tablist` / `tab` / `tabpanel` semantics and roving focus. `SegmentedControl` stays as it is. **Row selection clears when switching tabs.**
- **§2.4 "Missing {n}" becomes "{n} to buy"**, both in the top row and the Ingredients tab badge: `shortOrMissingCount` includes short lines. String `pantry.toBuy_one/other` "{{count}} to buy" replaces `pantry.missingShort_one/other`.
- **§2.4 status pill**: the match has no `pantryBasic` status; a Pantry Basic line is `status: 'covered'` with `pantryBasic: true`. Check the flag first.
- **§2.4 per-line add is on every line**, Pantry Basics, optional and covered lines included (ADR 0007 updated: the "never added" rule is for Add missing only). Quantity added: the shortfall for a short line; otherwise the line's full quantity at the picked Servings; no quantity for a quantity-less line. Repeated adds merge and sum like Add missing.
- **§2.4 per-line endpoint**: new `POST /recipes/:id/add-line?locale=` with body `{lineId, servings, today}`, through the same path as add-missing (`addItemsFromRecipe`), so the server scales, records the Source Recipe, merges, and handles Unmatched names. Returns the `ShoppingListView`. The Shopping List add-item endpoint is **not** used: it can't record a Source Recipe.
- **§2.5 timer** is a non-interactive pill, not a `<button>`. A running timer is a later follow-up.

The "Open questions" at the end are all answered above.

## Part 1 — Recipes list (`/recipes`)

### 1.1 Summary of the change

The list keeps its behaviour (search + Cuisine + Method filters; Base Recipes by default, Variants join the results once a search or filter is active) but gets a layout. A horizontal "You can make this" strip of compact tiles sits at the top, fed by the existing `GET /recipes/cook-tonight` endpoint. Below it the full list becomes a table of rows with a time column, and rows that appear in the cook-tonight result carry a status pill. Native `<select>` filters become scrollable chips. No API change is needed.

### 1.2 Layout (portrait, 390 pt reference, 20 pt page gutter)

Top to bottom:

| Region | Notes |
|---|---|
| Screen header | `AppScreenHeader` with title "Recipes". Right action: **"+" (New Recipe)** — 44 pt circle, same style as Home. Route for "+": the family-recipe creation flow (today only reachable via Make a Variant / Plate scan; if no standalone creation exists yet, hide the button until it does). |
| "You can make this" strip | Section label (12/700 caps, `--muted`, 0.06 em) with a right-aligned link "From your Pantry" (13/700, `--accent`) that goes to `/pantry`. Then the tile carousel (§1.3). **Hidden while a search or filter is active.** Hidden entirely when cook-tonight returns no cards. |
| Search + filter chips | Search field 48 pt, radius 16, white, `--line` border, search icon left; focus = `--accent` border + 3 pt `--accent-tint` ring. Chip row (§1.4) 8 pt below. In the prototype this block is `position: sticky` at the top of the scroll view with the page background behind it. |
| List | Section label "All Recipes" (or "Matches" when filtering) with the count right-aligned. Rows per §1.5. Empty states per §1.6. |
| Dock | unchanged; pad content ≈ 120 pt at the bottom. |

### 1.3 "You can make this" tiles

Source: `useCookTonight(locale, today)` → `cards[]`, one per Base Recipe (`card.recipe` is the best-matching Recipe, base or Variant).

- Carousel: horizontal scroll, 12 pt gap, bleeds to the screen edges (`margin: 0 -20px; padding: 4px 20px 6px`), `scroll-snap-type: x mandatory`, **`scroll-padding-inline: 20px`** so the first tile aligns with the gutter.
- Tile: 196 × ≥ 92 pt, radius 18, padding 12 × 14, content bottom-aligned.
  - `canMake === true`: background `--accent`, white text.
  - `canMake === false` (one ingredient missing): white surface, `--line` border, `--ink` text, and a status line above the title: warning icon + "Missing {ingredient}" (11.5/700, `--soon-fg`). The green tiles have **no** status line (the section label already says it).
  - Title: display face 17/700, line-height 1.15, clamp to 2 lines.
  - Footer row (12 px, 85 % opacity, 6 pt above): left = clock icon + total minutes (`prep + cook`; omit if both null); right = **"{n} expiring"** chip (leaf icon, 11/700, `--urgent-fg` on `--urgent-bg`; on green tiles the chip background is white 92 %) when `expiringCount > 0`, otherwise "+{n} Variants" (11/600) when `otherVariantsCount > 0`, otherwise nothing.
- Tap → `/recipes/{card.recipe.id}`.
- Accessible name of the tile = title + status + footer text.

### 1.4 Filter chips

- One horizontally scrolling row (bleeds to the edges like the carousel), 8 pt gap. Chips: 32 pt tall (small size), radius 999, 12.5/600, white with `--line` border; **active = `--ink` fill, white text** (same as the Pantry filter chips).
- Order: when filtering, a leading "× Clear" chip; then all Cuisines; a 1 pt vertical divider; then all Methods. Options come from `useRecipeFilters(locale)`.
- A chip toggles its id in `RecipeBrowse` (`cuisineId` / `methodId`, one of each at most — tapping the active one clears it). Clear resets search and both ids.
- Keep the 300 ms search debounce and `keepPreviousData`.

### 1.5 List rows

One row per `RecipeListItem`, in the API's order (sorted by title). Row: `min-height 66`, padding 12 × 4, 1 pt `--line` top border (none on the first), 12 pt gap, whole row is the link.

Columns, left to right:

1. Body (flex 1, min-width 0)
   - Title 15/700 followed inline by the **family badge** when `owner === 'family'`: butter pill (`--butter` bg, `--butter-ink` text, 11.5/700, people icon 14 px, padding 3 × 8, radius 999, label "Your family's"). This replaces the text-only `OwnerBadge`.
   - When filtering and the row is a Variant: "Variant of {base.title}" line, 13/600, `--accent`.
   - Meta line 13/500 `--muted`: cuisine · method · difficulty · "{n} Variants" (only the parts that exist).
   - Status pills (only when the recipe is found in the cook-tonight cards, see below): "Can make" (check icon, `--accent` on `--accent-tint`) or "Can make {variantTitle}" when the match is via a Variant of this base; "Missing {name}" (warning icon, `--soon-fg` on `--soon-bg`); plus "{n} expiring" (leaf, `--urgent-fg` on `--urgent-bg`). 12/700, padding 3 × 8, 6 pt gap.
2. Time column (right-aligned, tabular numerals): total minutes 17/700 display face over "min" 11/600 `--muted`; "—" when both prep and cook are null.
3. Chevron 16 px, `--muted`.

Status join (client side, no API change): build a map from `cookTonight.cards` keyed by `card.recipe.id` **and** by `card.base.id`. For a row, look up its own id first; for a Base Recipe row with no direct hit, fall back to the base key (then the pill reads "Can make {card.recipe.title}"). Rows with no entry show no pill. Note this only covers recipes that qualify for cook-tonight (can make, or exactly one ingredient missing); showing coverage on every row would need the browse endpoint to return match data and is **out of scope**.

### 1.6 Empty, loading and error states

- No recipes at all: centred block, "No Recipes yet." 18/700 display, then "Scan a plate or make one from a photo." 14 `--muted`.
- No matches: "No Recipes match." / "Try another word or clear a filter."
- Loading: keep the spinner; with `keepPreviousData` the previous rows stay while the next load runs.
- API error: `Alert` above the list as today.
- Below the list when not filtering: hint "Search or pick a filter to see Variants on their own." (13 `--muted`) — optional, drop if it feels noisy.

### 1.7 Strings to add (`recipes.json`)

`canMakeThis` "You can make this", `fromYourPantry` "From your Pantry", `allRecipes` "All Recipes", `matches` "Matches", `clear` "Clear", `newRecipe` "New Recipe", `canMake` "Can make", `canMakeVia` "Can make {{title}}", `missingOne` "Missing {{name}}", `expiring_one/other` "{{count}} expiring", `otherVariants_one/other` "+{{count}} Variant(s)", `emptyHint`, `noMatchesHint`, `variantsHint`, `minutesShort` "min". Reuse `familyBadge`, `variantOf`, `variantCount`, `minutes`.

---

## Part 2 — Recipe detail (`/recipes/:id`)

### 2.1 Summary of the change

The detail page gets a hero (eyebrow, title, four fact cells) and splits today's sections across three sticky tabs: **Ingredients** (Pantry status + Servings + the ingredient table + Add missing), **Steps** (steps, timers, Step Tips, recipe Tips) and **About** (What's different, Pairings, When to eat, Nutrition, disclaimer; Variants for a Base Recipe). Ingredient rows become selectable; selecting a row reveals a per-line "add to Shopping List" button so single items can be added, including Pantry Basics. The header action depends on the owner: "+" (Make a Variant) on Catalog Recipes, a "…" menu (Make a Variant / Edit / Delete) on the family's own.

Section order inside the tabs follows `DETAIL_SECTIONS`; a section with nothing to show is omitted as today.

### 2.2 Header and hero

- Header: Back (left, 44 pt circle, chevron-left, goes to `/recipes`; replaces the Home button + the "All Recipes" link at the bottom). Right action:
  - `owner === 'catalog'` (and `canMakeVariant`): **"+"**, label "Make a Variant" → `/recipes/{id}/variant/new`.
  - `owner === 'family'` and not archived: **"…"** button (`aria-haspopup="menu"`), opens a dropdown anchored under it: min-width 190, radius 16, `--shadow-dock`, 6 pt padding; items 44 pt tall, 15/600, icon 18 px `--muted`, hover `--subtle`: "Make a Variant" (only when `canMakeVariant`), "Edit" → `/recipes/{id}/edit`, "Delete" in `--urgent-fg` → existing `ConfirmAction` flow. Tap outside or Escape closes it.
  - Archived recipe: no action; keep the "This Recipe is archived." notice under the hero.
- Hero (no card): eyebrow link "⑂ Variant of {base.title}" (12/700 caps, `--accent`) when `base` exists; title 28/700 display with the family badge pill inline (same pill as the list); then **fact cells** — grid `1fr 1fr 1fr 1.7fr`, 8 pt gap, 14 pt below the title. Cell: white, `--line` border, radius 12, padding 8 × 6, centred; label 10.5/700 caps `--muted`; value 17/700 display, tabular. Cells: **Time** "{prep+cook} min" (omit cell if both null), **Serves** = the *picked* servings (updates with the stepper), **Level** difficulty, **Style** cuisine on one line and method on the next (13/700, wraps).

### 2.3 Tabs

- Segmented control (existing `SegmentedControl` molecule): `--chip` track, radius 16, 4 pt padding; 3 equal buttons 40 pt, 14/600; selected = white, 14/700, 1 pt shadow. Sticky to the top of the scroll view with the page background (`position: sticky; top: 0`, full-bleed background).
- Tabs: "Ingredients", "Steps", "About". The Ingredients tab shows a **count badge** (11/700, `--urgent-fg` on `--urgent-bg`) with `match.shortOrMissingCount` when > 0.
- Switching tabs scrolls the content to the top. Tab state is local; default Ingredients. Use `role="tablist"` / `role="tab"` / `aria-selected` and give each panel `role="tabpanel"`.

### 2.4 Ingredients tab

Top row (section label style): left **"You can make this"** or **"Missing {n}"** (`match.canMake` / `match.shortOrMissingCount`), right the Servings stepper: pill 40 pt, white, `--line` border; − / + round 34 pt buttons; centre "{n} Serving(s)" 13.5/700 (min 1, max `MAX_SERVINGS`). Quantities and the match follow the picked servings as today (the hero "Serves" cell too).

**Ingredient table** — white card, radius 20, `--line` border, rows with 1 pt `--divider` separators, row padding 10 × 16, 44 pt min height, vertically centred:

- Name 15/600, followed inline (7 pt gap) by the **quantity tag**: 12.5/700 tabular, padding 1 × 7, radius 6; `--accent` on `--accent-tint` for required lines, `--muted` on `--ok-bg` for optional lines and Pantry Basics. Quantity text: "{qty} {unit}", bare number for `pcs`, no tag when quantity is null. Under the name, a 12.5 `--muted` line with the note and/or "optional".
- Optional lines and Pantry Basics render dimmed (name and tag in `--muted`).
- Right: status pill (12/700, padding 4 × 9, icon 14): covered → check, "In your Pantry", `--accent`/`--accent-tint`; short → warning, "Short {shortfall}", `--soon-fg`/`--soon-bg`; missing → warning, "Missing", `--urgent-fg`/`--urgent-bg`; `pantryBasic` → check, "Pantry Basic", `--ok-fg`/`--ok-bg`. Append " · on list" when `onShoppingList` and not covered (and after a per-line add). Words first, so colour is never the only cue (keeps today's `LineStatus` intent).

**Row selection and per-line add**

- The whole row is a toggle (`role="button"`, `aria-pressed`). Tapping selects it (background `--subtle`, extends to the card edges) and deselects any other row.
- While selected, the status pill collapses to its **icon only** (26 pt circle in the status colours, with the status text as its accessible name) and an **add button slides in** from the right (translateX 48 → 0, fade, 220 ms, `cubic-bezier(.2,.8,.2,1)`; no animation under reduce-motion): 34 pt circle, 1.5 pt `--accent` border, white, cart icon 16 px `--accent`; label "Add {ingredient} to Shopping List". After tapping: filled `--accent-tint`, check icon, disabled, label "{ingredient} added to your Shopping List"; toast "Added {ingredient} to your Shopping List"; the pill gains " · on list". Deselecting restores the full pill.
- Available on **every** line, Pantry Basics and optional lines included.
- Below the table: **full-width** primary button "Add {n} missing to Shopping List" (48 pt, `--accent`, white 15/700, cart icon) when `linesToAdd(match).length > 0`; disabled while the match is stale or the add is pending; after success it reads "Added to your list" and stays disabled; toast "Added {n} items to your Shopping List" (existing snackbar). Keep the "Some of these are already on your list; adding them again increases the amount." note (13 `--muted`) when any addable line is `onShoppingList`.

API note: the bulk button maps to the existing add-missing mutation. The per-line add needs either a new per-line endpoint (`POST /recipes/:id/pantry/add-line` with `lineId` + `servings`, so the server scales the quantity and sums with the list as it does for add-missing) or a call to the Shopping List add-item endpoint with the line's ingredient and scaled quantity (free-text name for Unmatched lines on family recipes). Prefer the former so a Source Recipe is recorded on the Shopping Item.

### 2.5 Steps tab

- White card; one block per Step: 28 pt `--ink` circle with the step number (display 14/700) on the left, text 15/500 line-height 1.45 on the right; 12 pt vertical padding, `--divider` separators.
- Timer (when `timerSeconds`): pill 32 pt, `--accent-tint`/`--accent`, clock icon, "Timer m:ss", 8 pt below the text. Display-only today; make it a button so a running timer can be added later without a layout change.
- Step Tips: dashed callout under the step text (`--subtle` background, 1 pt dashed `--line`, radius 12, 13 `--muted`), "**Tip:** {text}", with "(from the Base Recipe)" appended at 12 px when `inherited`.
- Below the card: section label "Tips" and the recipe-level Tips (`stepId === null`) in the same callout style, 8 pt apart. Omit when empty.

### 2.6 About tab

In order, each as a section label + white card (omitted when empty):

1. **What's different** (Variants only): one line per diff entry with a 22 pt square key: `+` (`--accent-tint`/`--accent`) added, `−` (`--urgent-bg`/`--urgent-fg`) removed, `⇄` (`--soon-bg`/`--soon-fg`) swapped "{from} to {to}"; name 14/500 with the amount in `--muted`. "Same ingredients as {base}." when the diff is empty.
2. **Pairings**: "Food" / "Drink" sub-labels (13/700 `--muted`); each pairing: label 15/700 (a link in `--accent` when `link.type === 'recipe'`; " · {ingredient name}" in meta when `link.type === 'ingredient'` and the name isn't already in the label), principle 12/700 caps `--accent`, reason 13.5 `--muted`.
3. **When to eat**: per moment a chip "Good for · {name}" (`--ok-bg`/`--ok-fg`) or "Avoid · {name}" (`--soon-bg`/`--soon-fg`) with the reason beside it (13.5 `--muted`).
4. **Nutrition**: the note as body text, line-height 1.5.
5. Disclaimer "General guidance, not medical or dietary advice." 12 `--muted` (only when any guidance rendered).
6. **Variants** (Base Recipes only): the existing list — title link + family badge + cuisine · method meta; "No Variants yet." when empty. Not in the prototype; place it last in About.

### 2.7 Accessibility and edge cases

- Tabs are keyboard-navigable (←/→ between tabs, Enter/Space to activate); the selected tab is announced.
- Ingredient rows: Enter/Space toggles selection; the add button is a real `<button>` with a specific label; status is conveyed in text (pill) or accessible name (icon state).
- Respect reduce-motion for the slide-in and the menu.
- Stale match (servings changed, new match not loaded): keep the previous pills, disable both add controls until the fresh match arrives (today's `stale` flag).
- 404 / error / loading unchanged (Alert, Spinner).
- Family standalone Recipe (`parentId === null`, owner family): no "Make a Variant" item in the menu; "…" still shows Edit and Delete.

### 2.8 Strings to add (`recipes.json`)

`back` "Back", `tabs.ingredients` / `tabs.steps` / `tabs.about`, `facts.time` / `facts.serves` / `facts.level` / `facts.style`, `pantry.missingShort_one/other` "Missing {{count}}", `pantry.addOne` "Add {{name}} to Shopping List", `pantry.addedOne` "Added {{name}} to your Shopping List", `pantry.addedList` "Added to your list", `family.moreActions` "More actions". Reuse everything else already in the file.

---

## Tokens used (no additions)

```
bg #EEF1EA · surface #FFFFFF · ink #17231C · muted #55635A · line #DCE3D8 · divider #EEF1EA · subtle #F7F9F5 · chip #E2E8DD
accent #2E6A4D · accent-tint #DDEBE2 · butter #F3D27A / butter-ink #4A3B0B
urgent-bg #FBE6DA / urgent-fg #B54A17 · soon-bg #F6EBC8 / soon-fg #6E5200 · ok-bg #EEF1EA / ok-fg #55635A
radius: card 20, input 16, chip 999 · fonts: Bricolage Grotesque (display), DM Sans (body)
```

## Open questions for the implementer to flag

- List "+": what does it open while there is no standalone family-recipe creation flow?
- Per-line add endpoint (see §2.4) — new endpoint vs reuse of the Shopping List add-item.
- Timer: display-only now; a running timer is a separate feature.
- Whether row selection should clear when switching tabs (prototype keeps it).

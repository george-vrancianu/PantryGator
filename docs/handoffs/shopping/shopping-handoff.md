# Shopping List — design handoff

> Superseded in part by ADR 0027: the Import pill now sits in the summary card and the `+` (Add items) in the header.

Status: approved design, ready for implementation. Date: 2026-10-13.
Reference prototype: `shopping-prototypes.html` (self-contained HTML, open in a browser; the same file is live at https://claude.ai/artifact/KHqzZjDsay1gkHUBCsoaAQ). It opens on **Variant C "One sheet"**, which is the approved design. A and B are kept for context only. The prototype is the source of truth for look, spacing and interaction; the numbers below are copied from it.

The page keeps using the app's light tokens (`packages/ui/src/theme/themes.ts`) and fonts (Bricolage Grotesque display, DM Sans body). Nothing new at token level.

Code touched: `apps/web/src/pages/Shopping/*` (`ShoppingPage.tsx`, `components/*`, `templates/TemplateActions.tsx`, `templates/ApplyTemplatePicker.tsx`), `apps/web/src/components/CatalogSearch.tsx` (or a new sheet-specific variant of it), `apps/web/src/i18n/locales/{en,da,ro}/{shopping,templates,staples}.json`. No API change.

---

## Decisions (2026-10-13)

Agreed in a grilling session after the handoff. **Where these differ from the sections below, these win.**

Language:

- **"Move {n} to Pantry"** is button copy only; the action is still **Finish Shopping** (glossary updated).
- **"in your basket" / "ticked off"** stay as UI copy (already used today); the domain term for the item state stays "checked".

Open questions (§11):

- **Toasts and the Done count**: both. A new toast replaces the current one (no queue).
- **Dismiss** with the × on the chip. Toast "Dismissed {name}" has **no Undo** (there is no un-dismiss endpoint and none is added).
- **Template preview names**: extend `TemplateSummary` with `previewNames: string[]`, the first 4 line names in the template's stored order, localised by the request locale. `GET /shopping-templates` takes `?locale=`; `useTemplates` gets the locale in its query key.
- **Quick-name chips** in the save view are **dropped**.

Other corrections:

- **§7 "Removed {name}" toast has no Undo.** Re-adding through the add-item body would lose the item's Source Recipes. Star toasts ("{name} is now a staple" / "removed from staples") are in.
- **§4.3 aisle tiles**: the seeded aisles are Fruit & veg, Bakery, Meat & fish, Dairy & eggs, Frozen, Dry goods, Tins & jars, Oils & spices, Snacks & drinks, Other, and aisles have no slug. Catalog search results gain `parentCategory.aisle` as `{ id, name }` (small API change). The tint map `aisleTints` lives next to the tokens, keyed by the seeded aisles' stable ids: Fruit & veg = Produce tint; Bakery, Meat & fish, Dairy & eggs, Frozen = their own tint; Dry goods and Tins & jars = Pantry tint; Snacks & drinks = Drinks tint; Oils & spices = Bakery tint; Other and unknown aisles = neutral (`--chip-neutral` / `--muted`).
- **§4.3 "On list"**: the tag shows for any unchecked item with that Ingredient (or name). The server merges an add only when the unit matches too (and a merge unchecks a checked line), so the hint reads "Already on your list. Adding again increases the amount." only when the chosen unit matches an unchecked line's unit; otherwise "Already on your list in {unit}. This adds a separate line."
- **§5.3 a new template lands at the bottom** of the list (`createdAt` order is kept), not the top.
- **§7 toasts**: a new `ToastProvider` + `useToast()` in `packages/ui` on MUI Snackbar: ink style, 2.6 s, optional action, bottom offset above the dock or the sheet, reduce-motion, replace-not-queue. The `Snackbar` atom stays for its current users.
- **§4 sheet**: a new `Sheet` molecule in `packages/ui` on MUI Dialog (focus trap, return focus): bottom sheet below `md` (handle, 90 dvh, top radius 28, 340 ms slide), centred `maxWidth sm` / 80 vh from `md` up; slots for header, scrolling body and an optional sticky footer. Scan's `InfoSheet` is not migrated.
- **§4.1 search**: a Shopping-specific search on the existing `useCatalogSearch` hook with the same combobox semantics; the shared `CatalogSearch` is not changed.
- **`packages/ui` additions**: `ProgressBar` optional `size` (8 px, `--chip-neutral` track; default unchanged), `BookmarkIcon`, `TemplateIcon`. The handoff's `--chip` means `--chip-neutral`.
- **§4.4 typed units**: accept every alias in every locale (g, kg, ml, l, pcs, pc, stk, buc, case-insensitive, optional trailing "."); `,` becomes `.` before `parseQuantity`, which is unchanged.
- **§9 tests**: `FinishShopping.test.tsx` also needs updating. Romanian plurals need `_few` forms for the new count keys.

The "Open questions" at the end are all answered above.

---

## 1. Summary of the change

Today the page stacks everything in one column: summary card → suggestions (missing Staples, recently used up) → the add form (search, Quantity field, Unit select, full-width "Add to list") → two template buttons and a Templates link → the list → "Finish shopping".

After the change:

- The page is **summary card → list → "Save this list as a template" row**. Nothing else sits above the list.
- **One "+" button inside the summary card** opens the **Add sheet**. The sheet has two tabs: **Ingredients** (search, Staples and used-up suggestions, amount, add) and **Templates** (save the list, add from a template).
- **Quantity and unit become one field**, shown only for the result being added.
- **Staples move into the sheet**: with an empty search, missing Staples and recently used-up Ingredients show as one-tap chips. The header "Staples" link goes away; the sheet has a "Manage" link to `/shopping/staples`.
- **Finish shopping moves into the summary card** ("Move N to Pantry").
- **Save as template no longer leaves the page.** It is saved from the sheet and a toast offers "Edit".

## 2. Shopping screen layout (390 pt reference, 20 pt gutter)

| Region | Notes |
|---|---|
| Header | `AppScreenHeader` with title "Shopping". **No trailing action** (the Staples link is removed). |
| Summary card | §3. |
| List | Aisle groups, unchanged behaviour. Section label per aisle now carries the item count on the right (12/700 caps `--muted`). Rows unchanged (row toggle, star `StapleToggle`, remove ×). |
| Save row | §6.1. Shown only when the list has at least one item. |
| Empty list | Centred: "Your list is empty." (18/700 display) + "Add what you need, or start from a template." (13 `--muted`). The summary card with its "+" stays above it. |
| Dock | unchanged; content padded ≈ 120 pt at the bottom. |

Spacing between blocks: 18 pt.

## 3. Summary card

White, `--line` border, radius 20, padding 14 / 14 / 14 / 16.

- **Top row** (flex, 14 pt gap, centred):
  - Left (flex 1): "{remaining} to buy" display 24/700 tabular; "{checked} of {total} in your basket" 13/500 `--muted`; progress bar 8 pt tall, radius 999, `--chip` track, `--accent` fill, 9 pt above. Keep `ProgressBar` with its label "Basket progress".
  - Right: **Add button**: 52 × 52, radius 18, `--accent` fill, white plus icon 24 px, shadow `0 6px 14px rgba(46,106,77,.28)`. Accessible name "Add items". Opens the Add sheet on the Ingredients tab.
- **Finish row** (only when `summary.checked > 0`): 1 pt `--divider` top border, 10 pt above. Left: "{checked} ticked off" 13 `--muted`. Right: pill button 36 pt, `--ink` fill, white 13.5/700, Pantry icon 16 px, label **"Move {checked} to Pantry"**. Opens `FinishShoppingReview` exactly as the old "Finish shopping" button did. The old button at the bottom of the page is removed.

## 4. Add sheet

Use the existing `Dialog` atom (it is already a bottom sheet on phones and a centred dialog from `md` up). If its built-in header and actions don't fit the layout below, add a `variant="sheet"` or a sibling `Sheet` molecule in `packages/ui` rather than styling around it.

- Height 90 % of the viewport on phones, `--bg` background, top radius 28, grab handle 40 × 5 `--line`, 8 pt from the top.
- Scrim `rgba(23,35,28,.38)`. Tap on the scrim or Escape closes.
- Open/close: slide 340 ms `cubic-bezier(.2,.8,.2,1)`; instant under reduce-motion.
- **Header row** (padding 10 / 16 / 10 / 20): title "Add to list" display 22/700; right: **Done** pill 36 pt, `--ink`, white 14/700. Once anything was added in this session of the sheet, Done gets a leading count badge (20 pt, `--accent`, 11.5/700) with the number of adds. Done closes the sheet.
- **Tabs** under the header: segmented control (`--chip` track, radius 14, 4 pt padding, buttons 36 pt 14/600; selected white 14/700 with a 1 pt shadow). Labels **"Ingredients"** and **"Templates"**. `role="tablist"` / `role="tab"` / `aria-selected`.
- Body scrolls; 18 pt between blocks; padding 4 / 20 / 24.
- The sheet **stays open after each add** so several things can be added in a row.

### 4.1 Ingredients tab: search

- Search field 50 pt, radius 16, white, 1.5 pt `--line` border, 16/500 text, search icon 20 px at the left (46 pt left padding), clear × button (36 pt round, shown only with text). Focus: `--accent` border + 3 pt `--accent-tint` ring. Placeholder "Search ingredients".
- Focused when the sheet opens (after the slide-in).
- Keep the WAI-ARIA combobox semantics of `CatalogSearch` (`role="combobox"`, `aria-expanded`, `aria-controls`, the polite status line with the result count). The result list is the listbox.

### 4.2 Ingredients tab: empty search (Staples inside search)

Shown when the query is empty. Data: `useSuggestions` (same hook as today's `SuggestionsSection`).

1. **"Missing staples · {n}"** section label, with a **"Manage"** link (13/700 `--accent`) on the right → `/shopping/staples`. Then the chips.
2. **"Recently used up · {n}"** section label, then the chips.
3. **"Or start from a template"** section label with a **"See all"** link that switches to the Templates tab. One chip per template (template icon in `--butter-ink`, name, line count in `--muted`). A chip opens the apply view (§5.2) on the Templates tab. Hidden when the Family has no templates.

If both suggestion groups are empty: a "Staples" label with the Manage link and the line "All your staples are stocked." (13 `--muted`).

**Suggestion chip**: 38 pt tall, radius 999, white, `--line` border, wrapping rows with 8 pt gap. Two hit areas:
- Main part: plus icon 16 px `--accent`, name 14/600, amount 12.5/500 `--muted` tabular (omitted when quantity is null). Tap → add with the suggested quantity/unit (same body as today's `SuggestionRow`). Accessible name "Add {name} to the list".
- × part (separated by a 1 pt `--divider`): close icon 13 px `--muted`. Tap → `useDismissSuggestion`. Accessible name "Dismiss {name}". Toast "Dismissed {name}".

After an add the chip turns `--accent-tint` with a check icon and is disabled; it then disappears when suggestions refetch (the API already hides an Ingredient that is on the list).

### 4.3 Ingredients tab: search results

Section label: "{n} matches" / "1 match" / "No catalog match". Results in one white card (radius 20, `--line` border, `--divider` separators).

**Result row** (button, min height 58, padding 10 × 14, 12 pt gap):
- **Category tile** 38 × 38, radius 12, display 16/700 first letter of the name. Colour by aisle (pairs are background / text): Produce `#DDEBE2`/`#2E6A4D`, Bakery `#F6EBC8`/`#6E5200`, Dairy & eggs `#E3ECF3`/`#2F5674`, Meat & fish `#FBE6DA`/`#B54A17`, Pantry `#E2E8DD`/`#3C4A41`, Frozen `#E6E9F4`/`#3E4C7A`, Drinks `#EFE6F1`/`#6A3F72`. Aisles come from data, so map by aisle id/slug with a neutral fallback (`--chip` / `--muted`) for unknown ones. These are the only new colour values; keep them local to the component, or add them as `aisleTints` in tokens if the Pantry will reuse them.
- **Name** 15/600 with the matched substring in `--accent` 700 (case-insensitive, first occurrence).
- **Meta** 13/500 `--muted`: "{leafCategory.name} · {parentCategory.aisle}".
- **"On list" tag** (11/700, `--accent` on `--accent-tint`, radius 999) when an unchecked item with that `ingredientId` is on the list (client-side lookup in the list data).
- Chevron 18 px `--muted` on the right; rotates 90° when the row is open.

Tap a row → it **opens** (background `--subtle`) and shows the amount row (§4.4). Only one row is open at a time; tapping the open row closes it. Enter in the search field opens the first result. When the open row is "On list", add the hint "Already on your list. Adding again increases the amount." (12.5 `--muted`) under the amount row.

**Free-text row**, last, shown when no result's name equals the query (case-insensitive): tile `--chip` with a plus icon; name "Add “{query}”"; meta "Not in the catalog, added as free text". It opens the same amount row and adds as an Unmatched item (`{ name }`), like today.

Keep today's behaviour of `CatalogSearch` (debounce, locale, result limit).

### 4.4 Amount field (quantity and unit in one input)

Shown inside the open result row: padding 0 / 14 / 12 / 64 (aligned with the name), 8 pt gap.

- **Field**: flex 1, 44 pt, radius 14, white, 1.5 pt `--line` border; focus-within = `--accent` border + 3 pt `--accent-tint` ring.
  - Number input: `inputmode="decimal"`, 16/600 tabular, placeholder "Amount". Accessible name "Amount of {name}, for example 2 or 500 g".
  - **Unit chip** inside the field on the right: 32 pt, radius 10, `--chip` fill, 13.5/700, chevron-down 14 px. Shows the unit or "unit" when none. Pre-filled from the result's `defaultUnit`; empty for free text.
  - Tap the chip → a small popover under the field, aligned right: white, `--line` border, `--shadow-dock`, radius 14, 5 pt padding, buttons 34 pt / min 40 wide 13.5/700: "—" (no unit), g, kg, ml, l, pcs (`UNITS`). Selected = `--accent` fill, white. Choosing closes it and returns focus to the input. Escape closes it first, before the sheet.
  - **Typed units**: when the input matches `^\d+([.,]\d+)?\s*(g|kg|ml|l|pcs|pc)$` (case-insensitive), split it: the number stays in the input and the unit chip takes the unit. Run this on input; accept `,` as the decimal separator. Localise the unit aliases if the da/ro unit labels differ.
- **Add button**: 44 × 44, radius 14, `--accent`, white plus 20 px. Accessible name "Add {name} to the list". Enter in the amount input does the same.
- The amount is optional. Validation stays `parseQuantity` (0.001 to 1,000,000, up to 3 decimals). An invalid amount keeps the row open, marks the field (`aria-invalid`, `--urgent-fg` border) and shows the existing `finish.quantityInvalid` message under it.

**After an add**: call `screen.add` as today. On success: toast "Added {name}", increment the Done badge, **clear the query, close the row and focus the search field** again (the empty-search suggestions come back). On failure: keep everything as typed and show the API error in an `Alert` at the top of the sheet body.

## 5. Templates tab

Same sheet, Templates tab selected. The tab has three views: list, apply, save. Changing tabs returns the Templates tab to its list view.

### 5.1 List view

1. A white card with one row: **"Save this list as a template"**: 40 pt tile (radius 13, `--accent-tint` fill, bookmark icon `--accent`), name 15/600, meta "{n} items, quantities included", chevron. Opens the save view. Hidden when the list is empty.
2. Section label **"Add from a template"** with a **"Manage"** link → `/shopping/templates`. Then a white card with one row per template (`useTemplates`): 40 pt tile (`--butter` fill, template icon `--butter-ink`), name 15/600, preview line 12.5 `--muted` single-line ellipsis "{lineCount} items · first names…", chevron. Opens the apply view.
   - The preview names need the template lines; `TemplateSummary` only has `lineCount`. Either show "{n} items" only, or add up to 4 line names to the summary response (small API change, optional; see §9).
   - No templates: "No templates yet. Save your list as one, or create one under Templates." (existing `apply.none`).

### 5.2 Apply view

This replaces the inline `ApplyTemplatePicker` swap. Keep its logic: Ingredients in the Pantry start unticked, others ticked, only ticked lines are added through `useApplyTemplate`.

- Top: "‹ All templates" back link (14/700 `--accent`) → list view; template name display 22/700; hint "Items already in your Pantry start unticked." 13 `--muted`.
- One section label + white card per Aisle (shop order), then "Not in the catalog" for Unmatched lines.
- Line row (checkbox button, `role="checkbox"`, `aria-checked`, min 50 pt, padding 8 × 14): 24 pt box (radius 8, 2 pt `#A7B3AA` border; ticked = `--accent` fill, white check), name 15/600, amount 13 `--muted` under it, then a tag on the right: **"In Pantry"** (`--ok-fg` on `--ok-bg`) when `inPantry`, else **"On list"** (`--soon-fg` on `--soon-bg`) when an unchecked list item has the same Ingredient (or the same name for Unmatched lines). Tags are 11.5/700, radius 999.
- **Sticky footer** (padding 12 / 20 / 20, `--line` top border): full-width primary 48 pt, radius 16, `--accent`, plus icon, **"Add {n} items to list"** (`apply.confirm`); disabled at 0 ticked or while pending ("Adding").
- On success: **close the sheet**, toast "Added {n} items from {template}". On error: `Alert` above the lines, the sheet stays open.

### 5.3 Save view

- "‹ Templates" back link → list view.
- Field "Template name" (label 13/700 `--muted`; input 50 pt, radius 16, 16/600, max 100 chars, placeholder "e.g. Weekly shop"), focused on open.
- Quick-name chips under it (32 pt, radius 999, white, `--line`, 13/600): "Weekly shop", "Party", "Holiday cabin", "Big monthly shop", minus the names the Family already uses. A chip fills the name field. Optional; drop them if they don't translate well.
- Preview: section label "Saves all {n} items, ticked ones too", then the item names with amounts in parentheses as one wrapped line (13.5 `--muted`, line-height 1.5). This matches `POST /shopping-templates/from-list`, which copies every item on the active list, checked or not, without the checked state.
- Sticky footer: primary **"Save template"** (bookmark icon), disabled while the name is blank or the save is pending ("Saving"). Enter in the name field saves.
- On success: **stay in the sheet**, go back to the list view (the new template shows at the top after the refetch), toast **"Saved “{name}”"** with an **"Edit"** action → `/shopping/templates/{id}`. This replaces today's automatic jump to the editor.
- Errors (`translateApiError`): `Alert` above the field. Too many lines and the 50-template limit (`MAX_TEMPLATES`) come back as API errors; when `templates.length >= MAX_TEMPLATES`, also disable Save and show the limit message under the field.

## 6. Entry points into the Templates tab

### 6.1 Save row at the end of the list

Under the last aisle group, full width: 1 pt **dashed** `--line` border, radius 20, transparent fill, padding 14 × 16, 12 pt gap. Tile 36 pt (radius 12, `--butter` fill, bookmark icon `--butter-ink` 18 px); title "Save this list as a template" 15/600; meta "Reuse these {n} items next time" 13 `--muted`. Opens the sheet straight on Templates → save view.

### 6.2 Template chips under the suggestions

See §4.2 item 3: a chip opens Templates → apply view for that template.

## 7. Toasts

Use the existing `Snackbar` atom. Ink background, white 14/600, radius 16, 20 pt from the sides, above the dock (≈ 98 pt from the bottom; ≈ 92 when the sheet is open, above the sheet footer). 2.6 s. Optional action button (`#BFE0CC` 14/700).

Messages: "Added {name}", "Added {n} items from {template}", "Saved “{name}”" + Edit, "Dismissed {name}", "Removed {name}" + Undo (list row remove; Undo re-adds the same body; optional), "{name} is now a staple" / "{name} removed from staples" (optional, from the star).

## 8. Strings

Reuse what exists. New keys (en shown; add da and ro):

`shopping.json`
- `addItems` "Add items"
- `sheet.title` "Add to list", `sheet.done` "Done", `sheet.tabs.ingredients` "Ingredients", `sheet.tabs.templates` "Templates"
- `search.placeholder` "Search ingredients", `search.clear` "Clear search"
- `search.matches_one/other` "{{count}} match(es)", `search.noMatch` "No catalog match"
- `search.onList` "On list", `search.onListHint` "Already on your list. Adding again increases the amount."
- `search.freeText` "Add “{{name}}”", `search.freeTextHint` "Not in the catalog, added as free text"
- `amount.placeholder` "Amount", `amount.label` "Amount of {{name}}, for example 2 or 500 g", `amount.unit` "Unit: {{unit}}", `amount.noUnit` "unit", `amount.add` "Add {{name}} to the list"
- `added` "Added {{name}}"
- `summary.tickedOff` "{{count}} ticked off", `finish.move_one/other` "Move {{count}} to Pantry"
- `templatesFromSearch` "Or start from a template", `seeAll` "See all"
- `emptyHint` "Add what you need, or start from a template."

`staples.json`
- `suggestions.missingLabel` "Missing staples · {{count}}", `suggestions.usedUpLabel` "Recently used up · {{count}}", `suggestions.allStocked` "All your staples are stocked.", `suggestions.manage` "Manage", `suggestions.dismissed` "Dismissed {{name}}"

`templates.json`
- `save.row` "Save this list as a template", `save.rowHint_one/other` "Reuse these {{count}} item(s) next time", `save.rowMeta` "{{count}} items, quantities included"
- `save.placeholder` "e.g. Weekly shop", `save.preview_one/other` "Saves all {{count}} item(s), ticked ones too", `save.saved` "Saved “{{name}}”", `save.edit` "Edit"
- `apply.section` "Add from a template", `apply.allTemplates` "All templates", `apply.onList` "On list", `apply.added` "Added {{count}} items from {{name}}", `manage` "Manage"

Strings that go away: `shopping.staples` (header link), `shopping.add.quantity` / `add.unit` / `add.submit` (old form), `templates.apply.button` / `save.button` (old inline buttons), `shopping.finish.button` (moved into the card as `finish.move`). Delete them only after the tests are updated.

## 9. Behaviour and data notes

- **No API change is required.** Everything uses `useShoppingList`, `useShoppingMutations().add`, `useSuggestions`, `useDismissSuggestion`, `useTemplates`, `useTemplate`, `useApplyTemplate`, `useTemplateMutations().createFromList`.
- Optional API addition: up to 4 line names on `TemplateSummary` for the preview line in §5.1.
- "On list" in search and in the apply view is computed client-side from the loaded list (unchecked items only).
- The list keeps polling every 10 s; the sheet must not reset its state (query, open row, typed amount) when the list or suggestions refetch.
- `SuggestionsSection`, `AddItemForm` and `TemplateActions` are replaced. `ApplyTemplatePicker` keeps its logic but renders inside the sheet with the new row style and sticky footer. `ShoppingGroups` changes only the section label (count on the right).
- Tests to update: `ShoppingPage.test.tsx`, `Staples.test.tsx`, `ApplyTemplatePicker.test.tsx`, `TemplateScreens.test.tsx` (save no longer navigates to the editor).

## 10. Accessibility and edge cases

- The sheet is a modal dialog: focus moves into it (search field), is trapped, and returns to the button that opened it on close.
- Every icon-only button has a specific name (Add items, Clear search, Add {name} to the list, Dismiss {name}, Unit: {unit}).
- The result rows are options of the listbox; the open row's amount controls follow it in tab order.
- The unit popover is a group of toggle buttons (`aria-pressed`); Escape closes the popover before the sheet.
- Respect reduce-motion for the sheet slide, chevron rotation and toasts.
- Tablet / desktop (`md` and up): the sheet becomes a centred dialog (max width `sm`, max height 80 vh); the layout inside is the same.
- Long names: one line with ellipsis in results and template rows; wrapped in list rows (as today).
- Offline / API error while adding: `Alert` in the sheet, nothing is cleared.

## 11. Open questions for the implementer to flag

- A toast on every single add in the sheet, or only the Done count? The prototype does both.
- Dismissing a suggestion chip with the × on the chip (prototype) vs a long-press.
- Template preview names in §5.1: show "{n} items" only, or extend `TemplateSummary`?
- Quick-name chips in the save view: keep, or drop for translation reasons?

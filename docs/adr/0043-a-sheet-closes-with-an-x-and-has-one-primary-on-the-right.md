# A Sheet closes with an X and keeps its actions in one footer, the primary on the right

Each Sheet drew its own title, close and buttons, because `Sheet` offered only empty `header` and `footer` slots and every handoff specified its own sheet. An audit of about 30 sheets found:

- **Order:** the primary on the left in six sheets and on the right in ten.
- **Placement:** actions in a pinned footer, scrolling with the content, or in the header.
- **Closing:** an X in five sizes, "Close", "Cancel" and "Done" pills, an X and a Cancel together, and no visible close at all in about twelve.
- **Destructive actions:** four different forms.
- **Titles:** 18 to 25 px.
- **Bottom safe area:** padded in some footers and not in others.

We decided on one rule. `Sheet` enforces it through its interface: callers say what role each action plays, and `Sheet` draws it. Spec: #821.

## Decision

- **Close is an X at the right of the title row, on every Sheet that can be dismissed.** It is the same button everywhere, at 44 px. A Sheet that cannot be dismissed (Voice Review) shows no X; its Escape still asks before discarding. There is no Cancel button, because the X is Cancel: closing an edit Sheet throws the draft away without asking.
- **Every Sheet has a title in its title row,** drawn at display 25/800. It has an optional Back on the left and an optional subtitle, and it is the Sheet's accessible name.
- **Actions sit in a pinned footer.** The footer has one top border and is padded by the bottom safe area (ADR 0040). They are never inline in the content or in the header. A Sheet with no actions (pick a row, read-only) has no footer.
- **One primary on the right and at most one secondary on the left,** in a 1fr/2fr grid. A primary on its own is full width. A secondary never appears without a primary. The secondary is a real alternative ("No expiry", "Clear", "Use Catalog default"), never a way to close.
- **A destructive action is a danger link at the bottom of the content,** away from the primary (Remove from Pantry, Clear this meal). When destroying is the Sheet's purpose (Revoke a Promo Code, the Discard step of Voice Review), it is the primary, drawn in danger tone.
- **Labels:**
  - **Save** commits an edit.
  - **A specific verb**, with a count where it helps, creates or acts ("Add to Pantry", "Import 3", "Show 12 Recipes", "Revoke").
  - **Done** confirms a choice back to the screen underneath.
  - A Done that only closes the Sheet is removed; the X does that.
  - A Sheet that saves as the Member goes (Add to Shopping List, Add to Pantry) closes with the X (amended below: this holds only where every tap is a completed add).
- **Search and filters go in the `toolbar` slot** under the title row, outside the scroll, and never hold actions (see the Amendment).
- **While the primary is pending,** both footer buttons are disabled and the X still works.
- **A Sheet's primary is the standard primary button, not the gold key.** Gold marks the page's primary action in the top bar (ADR 0042); a second gold key inside a Sheet would weaken that signal.
- **`Dialog` is retired.** `Sheet` already becomes a centred dialog from `md` up, so short confirmations become content-sized Sheets that follow the same rule.
- **No custom footer.** `Sheet` no longer has `header`, `footer` or `label` (removed in #833, once every caller had moved). A Sheet that doesn't fit the rule needs an amendment here, not a hand-drawn footer.

This overrides the sheet-action parts of these handoffs: `canopy` (§8.1 "Close or Done right", §8.2 the Done pill on Add items), `shopping` (the Done pill), `shopping-import` (the Close and Cancel pills), `family-catalog-rows` (Save on the left), `settings-handoff` (the Save pill) and `voice-notes` (ghost Discard and Keep reviewing become the secondary). Opening and closing focus is unchanged (ADR 0039).

## Amendment (2026-11-18): the X is always Cancel, a toolbar slot, disabled alternatives

Spec: #871. Shipping the rule left five places where the code and the rule disagreed, or where the rule had no answer. These five decisions amend Decision above.

- **The X is always Cancel, including on live pickers.** Sheets where every tap is a completed add (Add to Shopping List, Add to Pantry) are not edits and still close with the X. A Sheet that edits a value holds a draft, and only its primary (Done or Save) commits it. The X, the scrim and Escape discard the draft. The expiry pickers used to save every tap straight away, so their X kept the date; they now hold the picked date as a draft and Done commits it. "No expiry" stays the secondary and commits at once, because it is a choice, not an edit.
- **The X always closes the whole Sheet.** A step inside a Sheet (the Family Ingredient pick step) goes back with Back, or with the action that confirms the pick. It never goes back with the X, the scrim or Escape.
- **No Sheet keeps a close-only Done.** The Meal Plan slot was the last one: Change Recipe becomes its primary, and "Clear this meal" stays the destructive link.
- **The secondary and the destructive link take `disabled`.** An alternative that cannot be used right now is drawn and announced as disabled, not hidden and not blocked in code with no cue (the Tags filter's Clear until a Tag is picked, the Meal Plan slot's Change Recipe and Clear, the Admin editors' Restore and Delete). A pending primary still disables both.
- **`Sheet` has a `toolbar` slot, for search and filter controls only, never actions.** It sits under the title row and above the scroller, pinned and outside the scroll. `Sheet` draws its fill (the sheet surface), its horizontal padding and the divider under it. Actions stay in the footer and the content roles above; a reviewer rejects an action in the toolbar. Callers never hand-build a sticky wrapper for top controls.

## Considered options

- **Let each Sheet choose between an X and a labelled Close or Done pill** (Canopy §8.1). Rejected: that choice is how the five kinds of close came about, and "Done" ended up meaning both "close" and "commit".
- **Primary on the left.** Rejected: ten sheets already had it on the right, which matches iOS and Android, and the eye ends on it.
- **Shared footer pieces that callers compose** (`Sheet.Footer`, `Sheet.Primary`). Rejected: every caller would still have to know the order, widths and safe area, so the rule would drift again. Props with roles let the type checker refuse a third button.
- **A danger button in the footer for every destructive action.** Rejected: it puts Remove next to Save, which is one slip from losing data. A link in the content keeps it apart.
- **Keep `Dialog` for confirmations.** Rejected: it has three users, all short confirmations or picks, and keeping it would mean a second action model to draw and test.
- **Sticky content inside the scroller** (a caller's own sticky wrapper for search and filters). Rejected because each caller hand-builds it (its own fill, overflow fix and padding) and it can cover the focused row.
- **Ask "Discard changes?" when an edited Sheet is closed.** Rejected for now: Cancel and the X discard silently today, and no Member has asked for it.

## Consequences

- About 30 call sites move to the new interface, one area at a time (#821). `SheetHeader`, the editor footer portal and `Dialog` were deleted.
- Some Sheets change shape:
  - **Quick View:** "See whole" becomes a link in the content, so Add and Make a Variant fit the footer.
  - **Meal Plan slot:** Clear becomes a destructive link, and (amended) it loses its Done: Change Recipe is its primary.
  - **Voice Answer and Family synonym:** they lose their Done.
  - **Revoke a Promo Code:** it is drawn in danger tone.
- Amendment (#871): the expiry pickers commit on Done and the X discards the pick; the Recipe picker moves its filters into `toolbar`; Tags filter, Meal Plan slot and the Admin editors show unavailable alternatives disabled instead of hiding them.
- Page tests that clicked Cancel or a header Done now use the X.
- New handoffs reference this ADR for Sheet actions instead of specifying them.
- Page bars that replace the Dock (Review, Catalog Recipe preview), popovers and full-screen camera tools are not Sheets and are not covered here.

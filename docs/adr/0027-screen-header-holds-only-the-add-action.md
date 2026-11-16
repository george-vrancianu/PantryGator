# The screen header holds only the screen's add action; the Dock carries navigation

> Superseded by [ADR 0042](0042-the-top-bar-holds-one-labelled-action-and-one-key.md).

The Pantry, the Shopping List and Recipes each put their add button somewhere different: the Pantry's `+` was the header action, Shopping's `+` sat in the summary card with Import in the header, and Recipes' `+` menu sat in the header's trailing slot. Every sub-screen header also carried a Home button on the left and, since #531, a Settings gear on the right. The Dock (ADR 0021) already has a Home tab, so the header Home button repeats it, and three buttons crowd a phone header.

## Decision

- **A sub-screen header holds the title and at most one button: the screen's add action.** On the Pantry, the Shopping List and Recipes it is the same accent `+`, in the same place.
- **An add with more than one way in opens a menu** from that same `+` (Recipes: New recipe, From link). `ScreenHeaderAction` takes `items` for this.
- **No Settings gear on sub-screens.** Settings is reached from the Dashboard's gear only.
- **No Home button where the Dock shows.** Screens without the Dock (Customise, and the camera and Review under `/scan`) keep Home so they are never a dead end. Back links are unchanged.
- **Shopping's Import moves into the summary card,** where the `+` was. It is left out while the Start your list block shows its own Import tile, which is an empty list with at least one template.

## Considered options

- **Keep the gear on every sub-screen (#531).** Rejected: Settings is rarely needed mid-task, and the gear competed with the add button for the rightmost spot.
- **Give Recipes a plain `+` to New recipe and move From link elsewhere.** Rejected: it hides a common way in for the sake of uniformity; a menu behind the same `+` looks identical.
- **Hide the card's Import on every empty list.** Rejected: with no templates the Import tile is hidden too, and the sheet's Manage link would have no way in.

## Consequences

- Getting to Settings from a sub-screen takes two taps (Home in the Dock, then the gear).
- A future header button needs a reason to break the one-button rule; search and share stay possible as the single action on screens that add nothing.
- A Recipe editor (New, Variant, Edit) adds nothing, so its single header button is Save. It has no Dock and no Home button: Back is its exit.

## Amendment (2026-10-24): Explore on Recipes

- **Recipes' header gets a second button, the Explore pill, before the `+`.** Once Catalog Recipes leave the Recipes list (ADR 0029), Explore is the only way to find them, so it can't sit only inside the `+` menu. The `+` menu also gains From Explore, and the empty Recipes page links to it.
- **Explore and its Recipe preview have no gear.** The Explore header holds Back and the title only. On the preview, the actions are in a bottom bar that replaces the Dock.
- This is the one exception so far; the other sub-screens keep one button.

## Amendment (2026-10-25): the Gator mark on tab roots

- **The Dashboard, the Pantry, the Shopping List and Recipes (the Dock's tabs) show the Gator app mark in the header's leading slot**, empty there since Home left (above). Tapping it refreshes the screen; it adds nothing and navigates nowhere, so it does not count toward the one-button rule.
- **Sub-screens, Meal Plans and Settings do not show it.** Back and Home are unchanged where they appear.
- Design and decisions: `docs/handoffs/gator-header-logo/HANDOFF.md`.

# The top bar holds one labelled secondary action and at most one primary key

Supersedes [ADR 0027](0027-screen-header-holds-only-the-add-action.md) and its amendments. The Canopy redesign (`docs/handoffs/canopy/`) found that the one-button header made other ways in hard to find. Explore needed an exception, Settings took two taps, and Import lived in a card. The Gator mark in the leading slot also looked like a toy. We decided every page's top bar holds the title and status line, then at most one **labelled** secondary action, then at most one primary **key** (the gold `+`). There is no logo anywhere.

## Decision

- **The actions per page:**

  | Page | Secondary action | Primary key |
  |---|---|---|
  | Dashboard | Settings | — |
  | Shopping | Import | + |
  | Pantry | none, until Match items is designed | + |
  | Recipes | Explore | + |
  | Recipe | More | — |
  | Explore, Settings | — | — |

  Pages that are not listed follow the same shape.
- **An editor's primary key is Save**, drawn as a labelled gold key button (New, Edit and Variant recipe, the meal-plan and template editors). Gold always marks a page's primary action.
- **Back sits on the left** of sub-screens, as an icon-only button. The Home button rule from 0027 stays: Home shows only where the Dock is hidden.
- **The Gator mark and tap-to-refresh are gone.** Refreshing moves to pull-to-refresh on the content region, which every page gets from the shared layout. It has to ship before the mark is removed, because tapping the mark is the only way to refresh today.
- **Customise dashboard** leaves the header and becomes a link under the last Widget.

## Considered options

- **Keep 0027's one button and add exceptions.** Rejected: Explore was already one exception, and Settings, Import and Match items would each need another.
- **Icon-only secondary buttons.** Rejected: unlabelled icons were part of why the header read as a toy, and a label makes the one secondary action easy to find.

## Amendment (2026-11-17): the logo leads Home, and tab roots drop the status line

- **The Gator mark comes back as a link to Home**, before the title on every header without Back. It replaces the Home button, so Home is one tap away from every page, Dock or not. Tapping it plays the mark's Tap and goes to the Dashboard; it no longer refreshes (pull-to-refresh stays the only way).
- **Dashboard and Pantry carry no status line.** A line under the title on some tab roots and not others made the title jump when switching between them. The Dashboard's date moves out of the header into a calendar page beside the Pantry Health lights; Pantry's empty-state line and its Location chip counts are gone.
- Sub-screens (Explore, a Meal Plan, Review, Scan) keep their status lines.

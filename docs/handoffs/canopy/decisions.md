# Canopy: decisions from the grilling session (2026-11-16)

These decisions sit on top of `handoff.md` and replace anything there that contradicts them. The ADRs record the decisions that are hard to reverse: [0042](../../adr/0042-the-top-bar-holds-one-labelled-action-and-one-key.md) (the top bar's actions), and the amendments to [0031](../../adr/0031-background-reads-share-one-strip-and-link-reads-become-recipe-drafts.md) (the Gator bubble) and [0040](../../adr/0040-the-app-draws-edge-to-edge-and-pads-by-the-safe-area.md) (the Canopy covers the status bar).

## Shared layout

Most pages share one layout with three regions:

1. **Top bar:** title and status line, Back, and the page actions (ADR 0042).
2. **Header:** the page's own block. The Dashboard has Pantry health, the Pantry has search, Shopping has the count and progress bar, Recipes has Cook tonight, and a Recipe has its facts and coverage.
3. **Content:** the working sheet. It scrolls inside itself.

The top bar and header sit on one Canopy plane with one texture behind both.

- **How pages plug in.** Each page renders a `<Screen title status back secondary primary header texture>{content}</Screen>`. `Screen` puts the top bar and header into slots that `AppLayout` owns, through portals. The page keeps its own state, such as the search query.
- **Transitions.** While a transition runs, `AppLayout` keeps the outgoing page mounted by holding the previous `useOutlet()` element for about 280 ms. Both headers then exist at once, so they can be cross-faded and measured. If the Member navigates again mid-transition, the layout jumps to the newest page instead of queueing.
- **Header height is measured, not hard-coded.** The header animates to its measured height. "Fixed" means it never scrolls or collapses with the content. While loading, a page renders its header at its final size, with skeletons of the same size, so it never animates twice.
- **Motion on navigation, the same everywhere, drill-ins included (no slides):**
  - The top bar, header and texture cross-fade.
  - The header height animates over about 280 ms with `cubic-bezier(.2,.8,.2,1)`, and the sheet's top follows it.
  - The content fades out and back in, about 150 ms each way.
  - The glint keeps running and does not restart.
  - With reduced motion, everything swaps instantly.
  - The Explore slide goes.
- **Short phones and the keyboard.** The header stays fixed in v1, even on an iPhone SE and while a canopy field has focus. The layout exposes a "collapsed" header state, off for now, so a collapse can be added later.
- **Scrolling.** The sheet is the only scroller:
  - Window scrolling moves to the sheet's scroller. That covers Settings' per-tab `scrollY` and the `window.scrollTo` / `scrollBy` calls in the Recipe detail, `FamilyRecipeForm` and `useLiftIntoView`.
  - Sticky elements stick at `top: 0` of the scroller.
  - Scroll position is kept in memory per location: Dock tab roots restore it, drill-ins open at the top, and coming back restores it.
- **Pull-to-refresh**, on the sheet's scroller:
  - It starts only when the scroller is already at the top.
  - `RefreshLoader` drops from under the Canopy onto the sheet.
  - It refreshes the same queries `RefreshMark` refreshes today, and `RefreshDimmed` dims the content, not the Canopy.
  - It is on every layout page except the editors.
  - The scroller sets `overscroll-behavior: contain`.
  - With reduced motion, the loader shows without the drop.
  - It ships before the Gator mark is removed, because the mark is the only way to refresh today.
- **Which routes use it:**
  - **Canopy layout:** Dashboard, Pantry, Shopping (with Staples and Templates), Recipes, Recipe, Explore, Drafts, Cook tonight, Meal plans, Settings, Family, Customise and Admin.
  - **Top bar only, no header:** the editors (New, Edit and Variant recipe; meal-plan edit; template editor) and Scan Review. An editor's primary key is a labelled gold **Save**.
  - **No layout:** the camera (`/scan`). Intro and sign-in reuse the Canopy and sheet parts statically, with no transitions.
- **Wide screens.** The Canopy and sheet run full width. The top bar, header and content are each capped and centred (960 / 1180).

## Answers to the handoff's open questions (§12)

1. **Scrolling:** the Canopy stays fixed and content scrolls in the sheet (above).
2. **"Last added"** is the later of `max(ingredient_stock_history.lastStockedAt)` and the newest Batch's `createdAt`. Stock history catches Batches already used up; `createdAt` catches Unmatched Batches, which Stock history does not track.
3. **Empty Pantry.** Below ten Batches Pantry Health is not given, so the needle is parked and greyed, the verdict reads "Not enough to judge yet", and every lamp is unlit.
4. **Pantry health can't be removed** from the Dashboard. A stored `health` Widget is dropped when the layout is read, and stored layouts are not migrated.
5. **Bubble placement:** it is hidden under Sheets and in the camera, and sits 16 above the bottom safe area on pages without the Dock.
6. **Bubble Jobs:** it counts the Member's own Jobs on this device (ADR 0031 amendment).
7. **Dark values marked `derived`** get a review once the first dark screens are built.
8. **Refreshing:** pull-to-refresh replaces tapping the logo (above).

## Other decisions

- **The fourth light is "Nothing new", not "Stale".** "Stale" clashes with Stale Threshold. See `GLOSSARY.md`: Fresh in, Nothing new.
- **Match items** is not built yet. The Pantry's secondary slot stays empty until its screen and an endpoint for the Unmatched count are designed. Neither exists today.
- **Theme ids:** stored or sent `warm` and `minimal` map to `light`, on read and on write, with no cut-off. `THEME_IDS` lives in both `packages/ui/src/theme/themes.ts` and `apps/api/src/settings/settings.schemas.ts`, and both change.
- **Naming:** code, issues and docs say "Dashboard". The handoff's "Home" is only the Dock tab's label. The second Health Factor is "Supply", as on `main`.
- **Build order:**
  1. Tokens, fonts and Appearance.
  2. The layout (regions, `Screen`, motion, inner scroll, pull-to-refresh). Pages move over with today's look, and the logo stays.
  3. The Canopy look (texture, glint, ADR 0042 actions, logo removed, Dock restyle).
  4. Pantry health.
  5. The Gator bubble.
  6. Page by page.

# Canopy — amendments to earlier handoffs and to SPEC.md

Canopy is a re-skin with a few structural changes. This file lists, per earlier document, what it replaces and what it leaves alone. Section numbers on the right refer to `handoff.md` in this folder. Where an earlier handoff is not listed, only its colours, radii and shadows change (through the tokens).

## `themes/` — replaced

| Was | Now |
|---|---|
| Three themes: Warm editorial, Minimal crisp, Dark-first | Two: **Light** and **Dark** (§0, §2) |
| `THEME_IDS = ['warm', 'minimal', 'dark']` | `['light', 'dark']`; stored `warm` and `minimal` map to `light` (§2.4) |
| 51 tokens | the same 51 keys with new values, plus 60 new keys (`tokens.canopy.ts`) |
| Fonts per theme (Fraunces, Instrument Sans, Sora, Albert Sans, …) | Schibsted Grotesk + Figtree only; the other families can be dropped from the font request |
| Pills (`--r-chip: 999px` in Warm and Dark) | no pills anywhere (§2.2) |
| Match system: "dark mode → dark, otherwise the chosen light theme" | Dark when the phone is dark, Light otherwise |


## `settings/` — Appearance only

The three theme tiles become two, Light and Dark (§8.3). Language, Catalog Language, Scan Language, the Family card, Expiring soon and Default expiry keep their behaviour; they are restyled with the recessed track and card styles (§5).

## `header-logo/` — removed

No Gator tile or logo in any page header (§4.2). Tap-the-logo-to-refresh goes with it. The mark stays in the Intro's brand lockup (§7.8) and as the app icon.

## `health-widget/` — card and sheet header replaced

| Section there | Change |
|---|---|
| §2 Widget (closed card), wide and small | Replaced by the cluster in the Home header: dial + four lights (§6.1 to §6.6). The `health` widget type leaves the registry and the Customise list |
| §3.1 Sheet header (ring + "Fresh 89 · Staples 71 …") | Replaced by the dial, "96 of 100" and a bar chart of the four checks (§6.7) |
| §3.2 To-do rows, items, done pills | Restyled as cards and square tags; structure and behaviour unchanged |
| §4 To-do catalogue, §5 Score, §6 Actions and API | Unchanged. The lights read the `expired`, `useSoon` and `runningLow` to-dos |
| §5.5 Score animation | The ring's 700 ms timing now turns the needle; the number counts only in the sheet |
| new | Fresh in / Stale, derived from the newest Batch's `createdAt` (`reference/healthLights.ts`) |

The boards label the second check "Supply", as the live app showed it on 2026-11-13; the older handoff says "Staples". Keep whatever `main` has.

## Background queue — Activity pill replaced by the Gator bubble

`claude/background-queue-notes.md` Round 2 (the pill above the Dock) and the pill loops in `cookbook-motion/` are superseded by §9. The Job model, the Review step and "nothing changes until you apply" are unchanged. The three animated SVG loops from `cookbook-motion/` have no place on the bubble, whose Gator face changes with the state instead; they could move to the Being read rows of the Review sheet (not drawn).

## `shopping/`, `shopping-import/`

- The Summary card moves into the canopy as the big count and a progress bar (§7.2).
- The header "Import" pill becomes the labelled Import button; "+" becomes the gold key button (§4).
- The Add items sheet keeps its content in the new sheet shell (§8).

## `recipes/`, `explore-recipes/`, `tags-filter/`

- The "You can make this" strip becomes the Cook tonight block in the canopy (§7.4).
- The Explore pill becomes the labelled Explore button (§4.2).
- Recipe detail: the hero is replaced by the canopy header; **Add missing moves from under the ingredient list into the header**, next to Pantry coverage (§7.5).
- The Tags button and its sheet keep their behaviour; the button is drawn in card style on the sheet and in canopy style on Explore.
- `cookbook-motion/`'s CookBook rename is independent of Canopy. The boards still say "Recipes"; use whichever name `main` has.

## `pantry-batches/`, `pantry-empty-add/`

- Location chips are square chips in one fading row (§7.3).
- A new header action, **Match items**, with the Unmatched count (§4.2). Its screen is not drawn.
- Add to Pantry keeps its three entry points in the new sheet shell (§8).
- Opened ingredients, Batch rows and the empty Pantry are not drawn in Canopy yet.

## `voice-notes/`

The mic stays in the Dock capsule, now drawn as the rocker (§3.5). The Review sheet is restyled (§8); Apply is labelled "Do these n" on the board, which is sample copy: keep the shipped label.

## `intro-gator/`, `claude/intro-flow-notes.md`

The first Launch screen becomes two-tone: canopy with the Gator above, a sheet with the headline and the two actions below (§7.8). The earlier note "no dark intro" is overridden by the canopy, which is dark green in both schemes. The headline on the board is the existing subtitle promoted to headline.

## Dashboard (`home-widgets/`, Customise)

- Pantry health is no longer a widget in the grid (§6.1).
- The Customise dashboard entry moves from the header to a link under the last widget (§4.2).
- Other widgets keep their content; cards follow §3.4. The Shopping tile is the page's one dark "hero" card (§7.1).

## SPEC.md

Suggested edits, to be worded by whoever owns the spec:

1. **Appearance:** two schemes, Light and Dark, and Match system. Remove the three named themes.
2. **Header:** no logo; one labelled secondary action per page; the list in §4.2.
3. **Pantry health:** shown in the Home header as a dial and four lights, always present; define Fresh in (added in the last 2 days) and Stale (nothing added for 14 days).
4. **Background reads:** progress and results are reached through the Gator bubble; describe its four states.

## GLOSSARY.md

No domain terms change. If UI terms are wanted there: **Canopy** (the green header), **Working sheet** (the light surface that rises over it), **Health lights** (Expired, Use soon, Running low, Fresh in, Stale), **Gator bubble**.

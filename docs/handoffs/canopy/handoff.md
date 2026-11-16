# Canopy — premium UI redesign — design handoff

Status: approved direction (C · Canopy, page textures, Pantry health as dial + lights). Date: 2026-11-16.
**Not checked against `main`.** Written from the project docs: the file tree snapshot of 2026-10-14 (`9237267`) and the handoffs since. File and component names below come from those; verify them before starting.
Reference prototype: `prototype.html` (self-contained, open in a browser; 21 boards at 390 × 844; links jump between boards; fonts load from Google Fonts). Live canvas: https://claude.ai/artifact/JXTr4h3jWXRwJBtXfhTx3d, page "Canopy". The prototype is the source of truth for look and spacing; every number here is copied from it. There are no screenshots in this zip: open the prototype.

Brief: the app "looks too much like a toy". Less rounding, no flat background, a new header, an elevated Dock, more depth everywhere.

Amends: `themes/` (replaced), `settings/` (Appearance), `header-logo/` (removed), `health-widget/` (closed card and sheet header replaced), the Background queue's Activity pill and `cookbook-motion/` (replaced by the Gator bubble), `shopping-import/` and `explore-recipes/` (header pills become labelled buttons), `recipes/` (Add missing moves into the header), `pantry-batches/` (Location chips), `intro-gator/` (two-tone intro). The list of changes per document is in `spec-amendments.md`.

Contents of this zip:

| File | What |
|---|---|
| `handoff.md` | This spec |
| `prototype.html` | All Canopy boards on one page. Board ids (`#C-Home`, `#C-Sheet-Health`, …) are used below |
| `tokens.canopy.ts` | Replacement for `themes.ts`: two themes, `light` and `dark`. The 51 existing keys plus 60 new ones |
| `icons-additions.ts` | Five new pictograms for the Pantry health lights, plus the map of reused icons |
| `reference/canopy.reference.css` | Header texture, glint, sheet, needle and lamp keyframes |
| `reference/PantryHealthCluster.reference.tsx` | The dial, a lamp and the cluster, with the geometry |
| `reference/healthLights.ts` | Pure functions: which lights are on, needle angle |
| `strings/en.json`, `ro.json`, `da.json` | New keys, same key set in all three. ro and da are a first pass: read them through |
| `spec-amendments.md` | What changes in earlier handoffs and in `SPEC.md` |
| `assets/textures/*.svg` | The four page-texture tiles and the line-only gingham tile for its glint |
| `assets/gator-bubble/*.svg` | Three head-only Gator faces for the bubble (thinking, happy, worried) |

---

## 0. Decisions already made, and a suggested split

Decided by the product owner (2026-11-13 to 16):

1. **Canopy replaces Warm, Minimal and Dark-first.** One look in two schemes, Light and Dark. Appearance in Settings becomes Light / Dark / Match system (§8.3).
2. **Header texture: page textures**, with a glint that lights only the lines, never the green (§3.2).
3. **No logo in the header.** Each page has one labelled secondary action (§4).
4. **Pantry health is a special widget** in the Home header: a small dial with a needle, no number, and four dashboard lights (§6). It is no longer a card in the widget grid.
5. **Lights:** Expired, Use soon, Running low, and Fresh in or Stale. Fresh in = something added in the last 2 days. Stale = nothing added for 14 days.
6. **Background actions** show as a draggable Gator bubble above the Dock, not as a bar (§9).

Suggested order. Each step leaves the app shippable:

1. **Tokens and fonts.** Swap `themes.ts` for `tokens.canopy.ts`, migrate the stored theme (§2.4), restyle the Appearance picker (§8.3). The app turns green-and-cream with square corners; layout unchanged.
2. **Shell.** Canopy header + working sheet + page texture in `AppLayout` / `AppScreenHeader` (§3), header actions without the logo (§4), Dock restyle (§3.5).
3. **Pantry health** in the Home header and the new sheet header (§6).
4. **Gator bubble** replacing the Activity pill (§9).
5. **Page by page:** Shopping, Pantry, Recipes, Recipe, Explore, Settings, sheets, Intro (§7, §8).

## 1. What exists

Three user-selectable themes (`themes/`: warm, minimal, dark; 51 tokens written as CSS custom properties by `applyTheme`). Cards 12–18 pt radius, pill chips, Dock 16–24 pt with a full-pill Camera / Mic capsule, a flat `--bg`, and a header made of a 42 pt Gator tile, the title and round icon buttons (`header-logo/`). Pantry health is a `WidgetCard` with a score ring (`health-widget/`). Background reads show as an Activity pill above the Dock (`claude/background-queue-notes.md`).

## 2. Tokens

`tokens.canopy.ts` has every value. It keeps the 51 existing keys, so current `var(--…)` usages keep resolving, and adds 60. A trailing `// derived` marks a value that is on no board (mostly Dark: only Home is drawn in dark).

### 2.1 Depth model

Two planes and three levels.

| Plane | Token | Light | Dark |
|---|---|---|---|
| Canopy (header) | `--canopy-bg` | radial highlight top-right `#336649` over `linear-gradient(165deg, #1F4631, #133022 56%, #0D2217)` | `#234A35` over `#132B1E → #0B1A12 → #060F0A` |
| Working sheet | `--sheet-bg` | `linear-gradient(180deg, #F8F7F2, #EDECE5)` | `#181E1A → #101511` |

| Level | Used for | How |
|---|---|---|
| Raised | cards, buttons, the selected segment, Dock | fill + 1 px line + a tight drop shadow (`--shadow-card`, `--shadow-btn`, `--shadow-key`, `--shadow-dock`) |
| Flush | rows inside a card, text | hairline `--line` between rows |
| Recessed | fields, tracks, empty tick boxes, icon tiles, Close | `--well-bg` + `--shadow-well` (inset), no border |

Rule of thumb: things you act with are raised, things you type or choose in are recessed.

### 2.2 Radii

| px | Token | Used for |
|---|---|---|
| 18 | `--r-sheet` | top corners of the working sheet and of bottom sheets (22 on the Intro) |
| 12 | `--r-dock` | Dock |
| 10 | `--r-cap` | the mic / camera rocker |
| 8 | `--r-card`, `--r-btn`, `--r-fab` | cards, primary buttons, every control on the canopy |
| 7 | — | health lamps |
| 6 | `--r-ctl` | secondary buttons, fields on the sheet, icon tiles, Close |
| 5 | `--r-chip` | segments, Location and filter chips |
| 4 | `--r-box` | tick boxes, count badges, the switch knob |
| 3 | `--r-tag` | tags, amount chips, gain pills, done pills |

Nothing is a pill. The only circles are the health hub and the Gator bubble.

### 2.3 Type

Display: Schibsted Grotesk 700–800. Body: Figtree 400–700. Both are already loaded by today's Minimal theme.

| Role | Spec |
|---|---|
| Page title (canopy) | display 25/1, 800, −0.035em, `--canopy-ink`; status line under it body 13/1, 500, `--canopy-muted`, 6 pt gap |
| Recipe title, Intro headline | display 31/1.05–1.08, 800, −0.04em |
| Sheet title | display 25/1, 800, −0.04em |
| Key number in the canopy | display 54/0.85, 800, −0.05em, `--gold` |
| Key number on a tile | display 50/0.95, 800, −0.045em |
| Row title | body 15–16/1.1, 600 (Recipes rows: display 17/1.15, 700, −0.02em) |
| Row meta | body 12.5–13, 400–500, `--muted` |
| Label (caps) | body 11/1, 700, 0.1em, uppercase, `--muted` (gold on the canopy); optional 14 px icon, 6 pt gap |
| Tag | body 10.5/1, 700, 0.05em, uppercase; height 22, padding 0 7, radius 3; urgent / soon / ok pairs; urgent has a 12 px alert icon |
| Button | primary body 15.5/700 (52 pt high); small primary and secondary 14/700 (44 pt); header button 13.5/700 (44 pt) |
| Dock label | body 11/1, 500 (600 when active), 0.01em |

### 2.4 Theme migration

`THEME_IDS` becomes `['light', 'dark']`. A stored `warm` or `minimal` becomes `light`; `dark` stays `dark` (`migrateTheme` in `tokens.canopy.ts`). Match system keeps its per-device value and now means Dark when the phone is dark, Light otherwise (`resolveTheme`). If the theme id is validated on the API (`settings.schemas.ts`), accept the old ids for one release and map them.

## 3. Shell

Board `#C-Home` shows every part. Markup and CSS shape: `reference/canopy.reference.css`.

### 3.1 Canopy header

- Full width, `--canopy-bg`, text `--canopy-ink`. It extends 40 px under the sheet so the green shows behind the sheet's rounded corners.
- Content padding: 16 left and right. In the 844 frame the title row starts at y 50, which is the room left for the status bar. In the app use `safe-area-inset-top + 6`.
- The header does not scroll or collapse (§12, open question 1).

### 3.2 Page texture and glint

Cream line art (`#F4F7F1`, baked into the SVG tiles) at 17 % opacity, strongest top-right and fading towards the text through `mask-image: linear-gradient(205deg, #000 8%, rgba(0,0,0,.5) 55%, rgba(0,0,0,.2) 100%)`.

| Page | Texture | Tile | Size | Inner opacity |
|---|---|---|---|---|
| Home, Intro, Settings | diagonal glazed tiles | `tex-home.svg` | 112 × 112 | 0.8 |
| Shopping | basket weave | `tex-shopping.svg` | 72 × 72 | 0.72 |
| Pantry | stocked shelves | `tex-pantry.svg` | 240 × 132 | 1 |
| Recipes, Recipe, Explore | gingham | `tex-recipes.svg` (glint: `tex-recipes-lines.svg`) | 44 × 44 | 0.9 |

Pages not listed (Meal plan, Admin, Family, Staples, Templates) use the tiles until someone draws them.

**Glint.** A second copy of the texture in soft gold (`#F6E7B4`, layer opacity 0.5) sits on top and shows only through a slanted soft-edged window: `linear-gradient(100deg, transparent, #000 50%, transparent)`, 46 % of the header width. The window travels from −150 % to 250 % in 6 s, then rests 4 s (10 s loop, `ease-in-out`, started 3 s in). Because the gold layer is itself masked by the texture, **only the lines light up; the green never changes**. On gingham the gold layer is masked by the line-only tile so the filled squares do not flash.

**Pantry only:** both layers slide one tile (240 px) to the left every 70 s, linear.

Reduced motion: the glint window stands still at 62 % and the shelves do not slide.

### 3.3 Working sheet

- Starts 20–28 pt under the last header element and runs to the bottom of the screen. y of its top edge in the 844 frame, per page: §7.
- `--sheet-bg`, top radius 18, `--shadow-sheet` (an upward shadow onto the canopy plus a 1 px inner highlight), padding 18 16 0, 12 pt between blocks (14 on Shopping and Settings › You, 16 on Settings › Family).
- Content scrolls inside the sheet.
- A 170 px gradient (`--sheet-fade`) is pinned to the bottom of the screen under the Dock, so lists dissolve instead of being cut.

### 3.4 Cards and groups

- Card: `--card-bg`, 1 px `--card-line`, radius 8, `--shadow-card`.
- Group = a label row (label left, count right in body 12/600 `--muted`, 2 pt side padding) 8 pt above a card. Rows inside are separated by 1 px `--line`; the first has none.

### 3.5 Dock

Same five slots and behaviour as today; only the look changes (`organisms/Dock.tsx`, `theme/dock.ts`).

| Part | Spec |
|---|---|
| Bar | left 16, right 16, bottom 26, height 66, radius 12, `--dock-bg` (near-black gradient), 1 px `--dock-line`, `--shadow-dock` (four layers: inner highlight, contact, mid, long) |
| Columns | `1fr 1fr 66px 1fr 1fr` |
| Tab | icon 22 (stroke 1.6, 1.9 active) over label, 5 pt gap; `--dock-off` (68 % cream), active `--dock-on` (white) |
| Active mark | a 16 × 2 gold bar, 6 pt above the bar's bottom edge, centred |
| Rocker | 58 wide, overhangs the bar by 13 at top and bottom (92 tall), radius 10, `--cap-bg` (gold gradient), 1 px `--cap-line`, `--shadow-cap`; mic on top, camera below, icons 24 stroke 1.7 in `--cap-ink`, a 1 px `--cap-div` divider inset 13 |

Settings shows the Dock with no active tab.

## 4. Header content

### 4.1 Title row

Height 44. Title + status line on the left, actions on the right, 8 pt between actions.

| Control | Spec |
|---|---|
| Labelled button (secondary action) | height 44, padding 0 12 0 11, radius 8, `--canopy-chip` + 1 px `--canopy-chip-line`, inner top highlight `inset 0 1px 0 rgba(255,255,255,.08)`; icon 18 (stroke 1.7) + label 13.5/700, 7 pt gap |
| Its badge | min 20 × 20, radius 4, padding 0 5, `--gold` / `--gold-ink`, display 11.5/800 |
| Key button (primary, "+") | 44 × 44, radius 8, `--key-bg` (gold gradient), 1 px `--key-line`, `--shadow-key`, plus icon 22 (stroke 2.2) in `--gold-ink` |
| Back | 44 × 44, radius 8, same fill as the labelled button, chevron-left 20; icon only, accessible name "Back" |

### 4.2 Actions per page

| Page | Secondary (labelled) | Primary |
|---|---|---|
| Home | **Settings** | — |
| Shopping | **Import** | + (Add items) |
| Pantry | **Match items** + the number of Unmatched Batches in the badge; badge hidden at 0 | + (Add to Pantry) |
| Recipes | **Explore** | + (Add a Recipe) |
| Recipe | **More** (the Recipe's overflow actions) | — (Back on the left) |
| Explore, Settings | — | — (Back on the left) |

There is no logo and no Gator tile in any header. The mark stays in the Intro's brand lockup. Tap-the-logo-to-refresh (`header-logo/`) goes with it; pull to refresh stays.

**Match items** opens the flow that links Unmatched Batches to Catalog Ingredients. That screen is not drawn (§13). Accessible name: "Match items, 3 unmatched".

**Customise dashboard** lost its header button. It is a quiet link under the last widget on Home: 44 pt high, centred, grid icon 16 + body 13/700 in `--muted`.

### 4.3 Fields and tracks on the canopy

- Search field: height 46, radius 8, `--canopy-field` + 1 px `--canopy-field-line` + `--shadow-canopy-field`, search icon 18, text body 15, placeholder `--canopy-muted`.
- Segmented track (Settings You / Family): height 44, radius 8, same recessed fill, 4 pt side padding; the selected segment is raised: 34 pt high, radius 5, `#F8F7F2`, `--ink` text, `--shadow-seg`.

## 5. Components on the sheet

| Component | Spec |
|---|---|
| Primary button | height 52, radius 8, `--btn-bg` (green gradient), 1 px `--btn-line`, `--shadow-btn`, white 15.5/700, optional icon 18. Small: height 44, radius 6, padding 0 16, 14/700 |
| Secondary button | height 44, radius 6, `--card-bg`, 1 px `--line-strong`, 14/700 `--ink` |
| Gold action on the canopy (Add n missing) | height 44, radius 8, `--key-bg`, 14/700 `--gold-ink`, icon 17 |
| Field (search on a sheet) | height 46–48, radius 6, `--well-bg` + `--shadow-well`, no border, search icon 18 |
| Segmented track | height 44, radius 8, `--well-bg` + `--shadow-well`; selected segment 34 high, radius 5, `--seg-on`, `--shadow-seg`, 14/700 (12.5 in the small variant); count badge 18 × 18, radius 3, urgent pair |
| Location / filter chip | 34 high inside a 44 pt target, radius 5, padding 0 11, 13/600 + count 12/600; unselected `--card-bg` + `--card-line`; selected `--ink` fill, card-coloured text |
| Tick box | 22 × 22 inside a 44 pt target, radius 4. Empty: 1.5 px `--box` border, `--box-bg`, `--shadow-box` (inset). Ticked: `--btn-bg`, white check 14 (stroke 2.8) |
| Switch | 48 × 28 track, radius 7, `--well-bg` + `--shadow-well`; knob 22 × 22, radius 4, `--card-bg`; on: track `--btn-bg` (not drawn), knob right |
| Icon tile | 38 × 38, radius 6, `--well-bg`, icon 19 `--ink-2`; severity tiles use the urgent / soon pairs |
| Close | 44 × 44, radius 6, recessed, × 19 |
| Stepper (Servings) | a card 44 high with − and + 44 pt targets and the value 14/700 between |
| Star (Staple) | 19 px; on: `--star-fill` with `--star` outline; off: outline in `--deco` |

Touch targets are 44 pt or more everywhere, including where the visible control is smaller.

## 6. Pantry health

Boards: `#C-Home`, `#C-Home-Dark`, `#C-Health-States` (four example states and a legend), `#C-Sheet-Health`. Code: `reference/PantryHealthCluster.reference.tsx`, `reference/healthLights.ts`. The score, the four checks, the to-dos and the sheet's actions are unchanged from `health-widget/`; this section replaces its closed card (§2 there) and its sheet header (§3.1 there).

### 6.1 Where it lives

In the Home header, 18 pt under the title row. It is not a `WidgetCard` any more: remove `health` from `widgets/registry.ts` and from the Customise list, and drop it from stored Dashboard layouts when they load. Home's sheet starts at y 218.

### 6.2 Layout

One button. Left: the dial with the caption "PANTRY HEALTH" (label style, `--gold`) 9 pt under it, centred. 16 pt gap. Right: verdict (display 20/1.05, 800, −0.03em), 5 pt under it the summary (body 12.5/500 `--canopy-muted`, one line, ellipsis), 11 pt under that the row of four lamps, 8 pt apart.

Summary text: "{n} to do · {first to-do title}", or "Nothing to do". The verdict and its thresholds are those of `health-widget/` §5.3.

### 6.3 Dial

92 × 58. No number on Home.

- **Band:** a 120° arc (−60° to +60°), outer radius 48 around (46, 52). Its thickness swells from 1.4 at the low end to 6.8 at the high end: `1.4 + 5.4 · t^1.3`. The first 15 % is red (`--dial-bad` `#E8744D`); from there it runs from cream at 40 % to gold (`--dial-good`), with the blend happening between 42 % and 92 % of the arc. Round ends. Built from 36 flat segments; a gradient along the path is fine if it matches.
- **Scale:** five dots (r 1.1, cream at 42 %) at 0, 25, 50, 75 and 100 %, 13 inside the outer radius.
- **Needle:** cream, 40 long, 4 wide at the hub tapering to about 1 at the tip, pivoting on the hub. Angle = `−60° + 120° × score / 100`.
- **Hub:** 11 pt gold circle with a 2 px dark ring.
- The band's colours are fixed. They do not follow the verdict; the needle's position carries it.
- On the Health sheet the same dial is drawn in theme colours: red tip `--urgent-fg`, band `--line-strong` to `--accent`, needle `--ink`, hub `--accent`.

### 6.4 Lights

Four fixed positions. Each lamp is a 40 × 40 recessed window (radius 7, `inset 0 1px 3px rgba(0,0,0,.5)`) with a 22 px pictogram (stroke 1.7).

- **Unlit:** window `--lamp-window-off`, 1 px `rgba(255,255,255,.09)`, pictogram in cream at 20 %. The position stays readable, as on a car dashboard.
- **Lit:** window `--lamp-window` with a radial glow of the lamp colour at 24 %, 1 px border of the colour at 42 %, pictogram in the colour with `drop-shadow(0 0 5px …)` at 75 %. The count sits bottom-right (4 from the right, 3 from the bottom), display 11/800 in the lamp colour. Above 9 it reads "9+".

| Position | Light | Pictogram | Lit colour | On when | Count |
|---|---|---|---|---|---|
| 1 | Expired | jar with "!" | `--lamp-expired` `#FF7A5C` | the `expired` to-do has items (Batches past their date) | Batches |
| 2 | Use soon | hourglass | `--lamp-soon` `#F2C14E` | the `useSoon` to-do has items (inside the Expiring soon window) | Batches |
| 3 | Running low | jar with a down arrow over a low level | `--lamp-low` `#F2C14E` | the `runningLow` to-do has items | Ingredients |
| 4 | Fresh in | arrow dropping into a basket | `--lamp-fresh` `#86E0A6` | the newest Batch was added today or in the two days before | none |
| 4 | Stale | the same basket asleep, "z z" | `--lamp-stale` `#B9CBD6` | nothing has been added for 14 days or more | none |

Position 4: Fresh in when `days ≤ 2`, Stale when `days ≥ 14`, an unlit Fresh in between, where `days` is whole local days since the newest Batch's `createdAt`. A Pantry with no Batches shows an unlit Fresh in (assumption, §12). Constants and logic: `reference/healthLights.ts`.

The first three lights use the same lists as the sheet's to-dos, so a lamp's count always equals the number in its to-do title.

### 6.5 Motion

- **On appear** (Home opens, or the app returns to it): the needle drops back 46°, swings up, overshoots by 5° and settles within 2 s (`cubic-bezier(.3,.9,.3,1)`). Every unlit lamp flashes to 85 % and fades back to 20 % over 2.4 s, like a lamp check.
- **On a score change** while Home is open: the needle turns to its new angle in 700 ms `cubic-bezier(.2,.8,.2,1)` (the timing of `health-widget/` §5.5). Not in the prototype.
- **A lamp turning on or off:** cross-fade 300 ms (assumption, not drawn).
- Reduced motion: no settle, no lamp check; changes are instant.

### 6.6 Accessibility

The cluster is one `button` with `aria-haspopup="dialog"`; the dial and lamps are `aria-hidden`. Its name is built from the state: the title, the verdict, then the lit lights in position order (or "no warning lights" when nothing is lit):

> Pantry health: In good shape, 3 expired, 3 to use soon, new items in.

Strings for the parts are in `strings/*.json` under `dashboard:health.a11y`. Colour is never the only signal: each light has its own pictogram and position, and the sheet repeats everything in words.

### 6.7 Health sheet

`#C-Sheet-Health`. The sheet shell is §8.1. The header replaces the ring and the "Fresh 89 · Staples 71 …" line:

1. Label "PANTRY HEALTH" with the pulse icon, the verdict as the title (display 25/800), Close on the right.
2. A row, 14 pt under: the dial in sheet colours with "**96** of 100" under it (number display 14/800, rest body 12/700 `--muted`), then the four checks as a horizontal bar chart: label (58 wide, body 11.5/600 `--muted`) · bar (6 high, radius 3, track `--seg-off`) · value (26 wide, right-aligned, display 12.5/800). Rows 14 high, 8 apart. Each bar takes its check's colour by the usual thresholds (≥ 85 `--accent`, 65–84 `--star`, below `--urgent-fg`); the sample shows all four at 85 or more.
3. A 1 px `--line` rule, then the groups Now / This week / Tidy up as today.

To-do rows become cards (padding 10 10 10 12, 12 pt gap): icon tile 38 in the severity pair, title 15.5/700 with the gain pill (18 high, radius 3, ok pair, 11/800) and the chevron, sub-line 13 `--muted`, then the bulk button (small primary in Now, secondary elsewhere). Done pills: 28 high, radius 3, ok pair, check 13 + 12.5/700. Everything else (accordion, items, actions, Undo) is as in `health-widget/`.

The score number appears only here.

## 7. Screens

"Sheet top" is the y of the working sheet's top edge in the 844 frame.

| Screen | Board | Texture | In the canopy | Sheet top |
|---|---|---|---|---|
| Intro | `#C-Intro` | tiles | brand lockup, Gator | 546 |
| Home | `#C-Home`, `#C-Home-Dark` | tiles | title row, Pantry health | 218 |
| Shopping | `#C-Shopping` | weave | title row, count and progress | 196 |
| Pantry | `#C-Pantry` | shelves | title row, search | 174 |
| Recipes | `#C-Recipes` | gingham | title row, Cook tonight, chef Gator | 242 |
| Recipe | `#C-Recipe` | gingham | Back, lineage, title, facts, coverage | 318 |
| Explore | `#C-Explore` | gingham | Back, description, search and Tags | 232 |
| Settings | `#C-Settings`, `#C-Settings-Family` | tiles | Back, You / Family track | 170 |

The idea on every page: **the canopy carries the page's key number or state, the sheet carries the work.**

### 7.1 Home

Title = the greeting, status = the date. Sheet: a two-column grid (12 pt gap) with the Pantry tile (label, 38 in display 50, "items in stock", a 4 px three-segment Location bar in `--accent` / `--seg-mid` / `#C9A545`, Location counts) and the Shopping tile, which is the one dark "hero" card on the page (`--hero-bg`, number in `--hero-num`; in Dark it turns gold with dark text). Then Meal plan (icon tile + label + line + "Plan →" in `--accent`), then Use soon (label row with "See all", rows 44 high: name 15/600 + tag). Then the Customise dashboard link. Widgets other than Pantry health keep their content and behaviour; only the card style changes.

### 7.2 Shopping

Canopy, 18 pt under the title row: the open count in display 54 gold + "to buy" (body 16/600), "1 of 6 checked" on the right (body 13 `--canopy-muted`), and 12 pt under it a 5 px progress bar (track `rgba(255,255,255,.16)` with an inner shadow, fill `--gold`). This replaces the Summary card. Sheet: one group per Aisle; rows 52 min-height: tick box, Ingredient Icon, name 16/600, Staple star. A ticked row's name is `--muted` and struck through in `--deco`.

### 7.3 Pantry

Canopy: search field (§4.3) 16 pt under the title row. Sheet: Location chips in one scrolling row that fades out on the right edge (`mask-image: linear-gradient(90deg, #000 84%, transparent)`), then one group per Location. Rows 58 min-height: Ingredient Icon 21 in `--muted`, name 16/600 over product 13 `--muted`, expiry tag, chevron-down. Opened ingredients and Batch rows are not drawn (§13); carry `pantry-batches/` over in this style.

### 7.4 Recipes

Canopy, 20 pt under the title row and at most 196 wide: label "COOK TONIGHT" in gold, a line in display 22/1.12 ("3 recipes use what goes off soon"), and a "See them →" link in gold. The chef Gator (166 wide) stands at the right edge at y 118 and is cut by the sheet. This replaces the "You can make this" strip. Sheet: search field + Tags button (46 high, raised card style), then the list as one group: title display 17/700, meta 12.5 `--muted` with the "Your family's" tag (soon pair, 20 high), minutes in display 22/800 + "MIN" caps, chevron.

### 7.5 Recipe

Canopy: Back and More; a row with the "VARIANT OF …" link (gold caps with the branch icon, 44 pt target) and the "Your family's" tag (gold outline on the canopy); the title; four facts in a row between two `--canopy-line` rules (caps label 10.5 over display 16/700, columns split by 1 px lines); then Pantry coverage: "**3 of 8** in your Pantry" over a 5 px gold bar, with the gold **Add 5 missing** button on the right. **Add missing moves here from under the ingredient list.** Sheet: Ingredients / Steps / About track (count badge on Ingredients = lines to buy), "5 TO BUY" label + Servings stepper, then the lines in one card: name 15.5/600 · amount chip (20 high, radius 3, `--well-bg`, 12/600) · status tag (Missing urgent, Short soon, In Pantry ok). Steps and About are not drawn (§13).

### 7.6 Explore

Canopy: Back + "Explore" with "Catalog Recipes" under it, a one-line description (body 13.5 `--canopy-muted`), then search + a Tags button in canopy style. Sheet: the list as a group; each row ends in a 44 pt square button: "+" (card fill, 1.5 px `--accent` border) or, once added, a tick on the ok pair. "Show n more" is a dashed outlined button 48 high.

### 7.7 Settings

Canopy: Back + "Settings", and the You / Family track 16 pt under. **You:** a lead line, then Appearance (§8.3), Language, Catalog Language and Scan Language as segmented tracks (the last two in the small variant with a caption under). **Family:** the Family card, Credits and Activity as cards. Content and behaviour as in `settings/`.

### 7.8 Intro

Two-tone: canopy down to y 620 with the tiles texture, the brand lockup at the top (38 pt app icon, radius 8, + "PantryGator" display 19/700), a soft gold glow (360 circle, `rgba(232,203,124,.20)` to 0) behind the Gator (336 wide, top 262) and a blurred floor shadow under it. Sheet from y 546, radius 22, padding 32 24: the headline (display 31/800), then at the bottom **Get started** (primary, 56 high) and "I already have an account" (text button, 48 high). Only this first screen is drawn; Languages, Log in and the setup steps follow the same recipe.

## 8. Sheets

Boards: `#C-Sheet-Health`, `#C-Sheet-AddItems`, `#C-Sheet-AddPantry`, `#C-Sheet-VoiceReview`, `#C-Bubble-Sheet`.

### 8.1 Shell

Scrim `--scrim` (`rgba(5,14,9,.58)`). Sheet: `--sheet-bg`, top radius 18, shadow `0 -20px 44px -12px rgba(3,14,8,.75)` plus the inner highlight, padding 9 16 0. Handle 38 × 4, radius 2, `--line-strong`, centred. Title row 12 pt under the handle: title (display 25/800) left, Close or Done right. Motion, focus and dismissal as the `Sheet` molecule does today.

### 8.2 Contents

- **Pantry health:** §6.7.
- **Add items** (Shopping): title + **Done** (44 high, radius 6, the dark Dock gradient, white 14/700), search field, then "Gone from your Pantry" with Manage, as tiles in a two-column grid (cards 58 high: Ingredient Icon, name 15/700, the reason in 12/600 with a clock icon, urgent for expired and muted for used up, × to dismiss). Behaviour: `shopping-import/` and `catalog-search/`.
- **Add to Pantry:** three actions in a row (Take a photo · Scan barcode · Say it), each a card 96 high with a 40 pt tile (`--ok-bg`, icon 22 in `--accent`) over a 13.5/700 label, then the search field. Behaviour: `pantry-empty-add/`.
- **Voice Note review:** a 58 pt square Gator face (happy, radius 8) beside "Here's what I heard" (display 23/800) and "0:07 · English", Close on the right. The transcript in a recessed box (radius 6, italic 14). Changes grouped by list (Pantry, Shopping List) as cards, one row per change (50 min-height: icon, name 15.5/600, amount 13/600 `--muted`, an ok tag naming the change). A note, then Discard (secondary, 52 high) and **Do these 3** (primary, twice as wide). Behaviour: `voice-notes/`.

### 8.3 Appearance (Settings › You)

Replaces the three theme tiles. Board `#C-Settings`.

- Two tiles in a two-column grid, 12 pt gap: **Light** and **Dark**. Tile: card fill, radius 6, 1.5 px `--line-strong` border, padding 7 7 10; a 66 pt preview (a green band with one cream line, and a sheet rising over it with an ink line and an accent bar) over the name (body 14/700).
- Selected: 1.5 px `--accent` border, a soft green shadow, and a 20 × 20 `--accent` badge (radius 4) with a white check on the top-right corner. `aria-pressed`.
- Under a rule: **Match system** with its switch, the line "Dark when the phone is in dark mode, Light otherwise" and the "This phone" caption. While it is on, the tile of the scheme in use is selected; tapping a tile turns Match system off (proposed: keep today's behaviour if it differs).

## 9. Gator bubble (background actions)

Boards: `#C-Bubble-States`, `#C-Bubble-Reading`, `#C-Bubble-Done`, `#C-Bubble-Failed`, `#C-Bubble-Drag`, `#C-Bubble-Sheet`. Replaces the Activity pill above the Dock. The Job model in `claude/background-queue-notes.md` is unchanged.

### 9.1 The bubble

- 56 pt circle, 16 from the right edge and 16 above the Dock (bottom 108 in the frame). Shown only while the queue holds a Job that is reading, ready to review or failed.
- Layers: the disc (`linear-gradient(180deg, #262F29, #121814)`), a progress ring (stroke 3, inset 2), and a 42 pt face (inset 7) with the Gator head on a green radial ground (`#3A6E50` to `#173323`).
- **Draggable.** While dragged it scales to 1.12 and its shadow deepens. On release it snaps to the nearer side edge, 16 from it, keeping its height; it stays between the header and the Dock, and the place is remembered per device (snap and memory are proposed, not drawn). While dragging, a dashed circle (1.5 px, `rgba(20,30,22,.42)`) marks where it came from.
- Tap opens the **Review** sheet.

| State | Disc | Ring | Badges (20 pt, 2 px `#101511` ring) | Gator |
|---|---|---|---|---|
| Reading | dark | one 26 % gold arc going round | grey count, top-right | thinking, eyes up |
| Some ready | dark | gold for the share that is ready, cream for the rest | gold count ready top-right, grey count reading bottom-right | thinking |
| **All done** | **gold** gradient, cream face, 6 px gold halo | full, green `#1C6A43` | green badge with a tick and the count | happy |
| Could not read | dark | gold share + red share (`#F0693A`) | gold count ready top-right, red count failed top-left | worried |

Badge pairs: grey `#F4F7F1` / `#141A16`, gold `#E8CB7C` / `#2A2105`, green `#1C6A43` / white, red `#B93A14` / white; display 11.5/800.

On a state change a label slides out to the left of the bubble for 3 s ("3 ready to review"): 36 high, radius 8, padding 0 13, the dark disc gradient, white 13.5/700, 10 pt from the bubble. "All done" stays until everything has been reviewed or discarded.

Ring shares: one share per Job in the order ready, failed, reading, with a small gap between shares. The "Some ready" board draws the reading share shorter than its slot to hint at progress; use the full share unless real progress is available.

Accessible name: the state as a sentence plus "Open Review", for example "2 ready to review, 1 could not be read. Open Review". State changes are announced once through the toast live region. The bubble is a `button`; dragging has a keyboard alternative: when focused, Left and Right arrows move it to that edge.

### 9.2 Review sheet

Sheet shell as §8.1. Header: a 52 pt round Gator face (thinking), the title "Review" with a summary line ("2 ready · 1 reading · 1 failed"), Close. Three groups, each only when it has Jobs; rows 62 min-height:

| Group | Row | Action |
|---|---|---|
| Ready to review | icon tile, title 15.5/700, what it found | **Review** (44 high, radius 6, gold key style) |
| Being read | icon tile, title, a 4 px progress bar in `--accent` with the step text beside it | cancel (×, 44 pt) |
| Could not be read | icon tile on the urgent pair, title, the reason | **Discard** (secondary) |

Footer: **Review all (n)** (primary) and the note "Nothing changes until you review and apply."

## 10. Dark

Only Home is drawn in dark (`#C-Home-Dark`). The canopy gets deeper, the sheet turns near-black green, cards `#1E2621` with a top inner highlight instead of a border, the accent becomes mint `#7FD3A0`, and the hero tile flips to gold with dark text. The Dock gets a slightly lighter bar so it still reads as raised. Every other dark value in `tokens.canopy.ts` follows from those and is marked `derived` where no board shows it. The health dial and lamps are identical in both schemes because the canopy is dark in both.

## 11. Motion summary

| What | Timing | Reduced motion |
|---|---|---|
| Texture glint | 10 s loop: crosses in 6 s, rests 4 s, `ease-in-out` | window still at 62 % |
| Pantry shelves | 240 px per 70 s, linear | still |
| Needle settle | 2 s, once, on appear | none |
| Lamp check | 2.4 s, once, on appear | none |
| Needle on score change | 700 ms `cubic-bezier(.2,.8,.2,1)` | instant |
| Bubble drag | scale 1.12 while held; snap 220 ms (assumption) | no scale, instant snap |
| Bubble label | slides out, stays 3 s | appears and disappears without sliding |

All loops are `transform`, `opacity` or `mask-position` only. Pause the glint and the shelves when the page is hidden.

## 12. Open questions

1. **Scrolling.** Drawn: the canopy stays put and content scrolls inside the sheet. On short phones (under about 700 pt) the Recipe header leaves little room. Options: let the sheet slide up over the canopy to a compact title bar, or let the whole page scroll. Not designed.
2. **Source of "last added".** `max(createdAt)` over current Batches misses a Batch that was added and already used up. If Stock history (ADR 0005) is cheap to read on the Dashboard, use its newest "added" entry instead.
3. **Empty Pantry.** Drawn as nothing: position 4 shows an unlit Fresh in. A new Family will see "In good shape" with all lamps off (same open question as `health-widget/` §10).
4. **Pantry health can no longer be removed** from Home, since it left the widget grid. Confirm.
5. **Bubble:** hidden while a sheet or the camera is open? Where does it sit on pages without the Dock? Proposed: hidden under sheets and in the camera; 16 above the bottom safe area where there is no Dock.
6. **Family-shared queue or personal** (carried over from the Background queue notes) decides whose Jobs the bubble counts.
7. **Dark** values marked `derived` need an eye once the first dark screens exist.
8. **Tap the logo to refresh** is gone. Is pull to refresh enough?

## 13. Not drawn yet

Match items screen · Recipe Steps and About tabs · an opened Pantry ingredient with its Batch rows · Meal plan pages · Customise dashboard · Scan camera and Scan Review · Tags, Expiry and Import sheets · empty states · the rest of the Intro (Languages, Log in, setup steps) · Admin, Family, Staples and Templates pages · tablet layouts · dark versions beyond Home. Build these from §2 to §5; ask for a board where the pattern does not carry.

## 14. Sample data on the boards

Live data from the product owner's Family where possible (96 and its four checks, 38 in stock, 6 to buy, the Fridge Batches, Air-fried chicken, 76 Credits). Adjusted to show more states: Bread ticked, two Staples starred, the Recipe mixes Missing / In Pantry / Short, Explore shows two already added, the queue shows two ready, one reading and one failed. **Invented:** "Match items 3", the lit lights and their counts, and every number on `#C-Health-States`. The prototype's ingredient glyphs are stand-ins for the 42 duotone Ingredient Icons, and its Gator art is redrawn from the promo screens: use the app's own.

## 15. Tests

- `tokens.canopy.ts`: both themes define every key; `migrateTheme` maps warm and minimal to light and dark to dark; `resolveTheme` follows the system when Match system is on.
- `reference/healthLights.ts`: each of the first three lights is on exactly when its count is above 0; position 4 is Fresh in at 0, 1 and 2 days, unlit at 3 and 13, Stale at 14 and beyond; no Batches gives an unlit Fresh in; a `createdAt` in the future counts as fresh; counts above 9 read "9+"; `dialAngle` gives −60, 0 and 60 for 0, 50 and 100 and clamps outside.
- Home: the cluster's accessible name lists lit lights; tapping it opens the Health sheet and focus returns to it on close; a lamp's count equals the number in its to-do title; with reduced motion no animation classes are applied.
- Header: each page shows its labelled action from §4.2; the Match items badge shows the Unmatched count and hides at 0; no logo is rendered.
- Appearance: choosing Light or Dark applies and persists; Match system follows the system and selecting a tile turns it off.
- Bubble: hidden with an empty queue; each state from §9.1 renders its ring, badges and face; tap opens Review; arrow keys move it between edges; its place survives a reload.
- Snapshots: Home in light and dark, one page per texture, the Health sheet.

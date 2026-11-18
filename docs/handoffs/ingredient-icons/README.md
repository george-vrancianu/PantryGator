# PocketPantry ingredient icons — duotone set

Preview artifact (light/dark, in context, tap-to-copy SVG): https://claude.ai/artifact/D1HobFHsmzCT2daYDF2zfA

## Decision (2026-10-13)

**Duotone** chosen after a four-style comparison (outline, filled, duotone, playful) on a 20-icon starter set. Reasons: it carries the aisle colour-coding from the shopping screen into every row, the outline inherits text colour so one set works in light and dark, and pale ingredients stay visible on white cards (which ruled out the Filled option).

## The set

All 42 catalog ingredients from `docs/shopping/prototype.html`. The handoff ids (`mozz`, `oj`, …) differ from the seed slugs, and the shipped mapping is keyed by Ingredient UUID (`ingredientIconMap.json`):

- Produce (13): tomato, cucumber, onion, redonion, garlic, potato, carrot, spinach, lemon, banana, apple, pepper, parsley
- Bakery (3): bread, tortilla, croissant
- Dairy & eggs (8): milk, eggs, butter, yogurt, feta, parmesan, mozz, cream
- Meat & fish (4): chicken, mince, salmon, bacon
- Pantry (10): pasta, rice, oil, flour, sugar, passata, chickpeas, oats, honey, coffee
- Frozen (2): peas, icecream
- Drinks (2): water, oj

## Spec

- 24-pt grid, 1.5 pt stroke, round caps and joins. Stroke = `currentColor`. The `body` part(s) are filled with the aisle tint; a few tiny parts (fish eye) are filled `currentColor`.
- Aisle tints, light (from the shopping handoff): Produce `#DDEBE2`, Bakery `#F6EBC8`, Dairy & eggs `#E3ECF3`, Meat & fish `#FBE6DA`, Pantry `#E2E8DD`, Frozen `#E6E9F4`, Drinks `#EFE6F1`.
- Aisle tints, dark (new): Produce `#24392E`, Bakery `#3B3320`, Dairy & eggs `#243440`, Meat & fish `#42291E`, Pantry `#2B332C`, Frozen `#272C3F`, Drinks `#362A3A`.
- Fallback for unknown or missing aisles: `palette('pp-chip')` (`#E2E8DD`).
- Sizes: 24 px in shopping/pantry/recipe rows, 40 px in scan tiles. Not below 20 px. Keep the stroke unscaled (`vector-effect: non-scaling-stroke`) above 48 px.

## Files

Shipped in `packages/ui/src/ingredientIcon/`. The sprite (`ingredient-icons.svg`) is not shipped, and `react-native-svg` is not used: the icon is a plain DOM `<svg>`.

- `ingredientIcons.ts` — `INGREDIENT_ICONS` (icon key → parts (`{ d, body?, dot? }`)) and `DEFAULT_ICON_KEY`.
- `ingredientIconMap.json` — Ingredient UUID → icon key.
- `IngredientIcon.tsx` — the component; the tint comes from the Aisle (`theme/aisleTints.ts`).
  ```tsx
  <IngredientIcon
    ingredientId={ingredient.id}
    aisleId={ingredient.aisle?.id}
    size={24}
  />
  ```
  Omit `ingredientId` (an Unmatched name) or give an unmapped one to get the Default Icon.

## Follow-ups

- New catalog items need an icon drawn in the same parts format; until then they show the Default Icon.
- Bottles/jars (oil, passata, water, honey, sugar, flour) differ mainly by label; revisit if users confuse them.

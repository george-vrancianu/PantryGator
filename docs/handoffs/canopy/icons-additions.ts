// Canopy — icon additions.
// Add to packages/ui/src/atoms/icons.tsx next to the existing set (same `lucide()` wrapper),
// then export them from packages/ui/src/index.ts.
//
// Only the five Pantry health lights are new. They are custom glyphs on lucide's 24 grid
// (round caps and joins, no fill), built with lucide's own `createLucideIcon` so they take
// `size`, `strokeWidth` and `color` like every other icon. In the lamps they are drawn at
// size 22 with strokeWidth 1.7 (the app default of 2 looks heavy at that size).
//
// Everything else in the prototype maps to an icon the app already has. The prototype's glyphs
// are simplified stand-ins; keep the app's own:
//   Header actions: Settings → the gear already used for Settings · Import → the Import pill's icon
//     (shopping-import) · Match items → LinkIcon · Explore → the Explore pill's icon (explore-recipes)
//     · More → the overflow (ellipsis) icon · Back → ChevronLeftIcon · "+" → the plus icon
//   Dock: Home, Shopping, Pantry (PantryIcon), CookBook / Recipes (RecipesIcon), mic and camera as today
//   Labels: Pantry health → the `pulse` icon from health-widget · Use soon → ClockIcon
//     · Meal plan → the calendar icon · Customise dashboard → CustomiseIcon
//   Health sheet to-dos: trash, clock/cook, calendar, hourglass, star and battery as in health-widget
//   Tags: expired → AlertIcon · "Your family's" → PeopleIcon · Variant of → the branch icon
//   Ingredient rows keep the 42 duotone Ingredient Icons (ingredient-icons); the prototype's are stand-ins.

import { createLucideIcon } from 'lucide-react';

const JAR_LID = { x: '8', y: '3', width: '8', height: '2.6', rx: '0.9', key: 'lid' };
const JAR_BODY = 'M7.8 5.6C6.5 6.5 5.5 7.8 5.5 9.5v9a2.5 2.5 0 0 0 2.5 2.5h8a2.5 2.5 0 0 0 2.5-2.5v-9c0-1.7-1-3-2.3-3.9';
const BASKET = 'M3.5 13.5h17l-1.4 6.7a1 1 0 0 1-1 .8H5.9a1 1 0 0 1-1-.8z';

/** Expired: a jar with an exclamation mark. Lit red (--lamp-expired). */
export const LampExpiredIcon = lucide(
  createLucideIcon('LampExpired', [
    ['rect', JAR_LID],
    ['path', { d: JAR_BODY, key: 'jar' }],
    ['path', { d: 'M12 10v5', key: 'bang' }],
    ['path', { d: 'M12 17.8v.2', key: 'dot' }],
  ]),
);

/** Use soon: an hourglass with a little sand left. Lit amber (--lamp-soon). lucide's `Hourglass` is an acceptable stand-in. */
export const LampSoonIcon = lucide(
  createLucideIcon('LampSoon', [
    ['path', { d: 'M7 3.5h10', key: 'top' }],
    ['path', { d: 'M7 20.5h10', key: 'bottom' }],
    ['path', { d: 'M8.5 3.5v2.5c0 2.5 3.5 3.7 3.5 6s-3.5 3.5-3.5 6v2.5', key: 'left' }],
    ['path', { d: 'M15.5 3.5v2.5c0 2.5-3.5 3.7-3.5 6s3.5 3.5 3.5 6v2.5', key: 'right' }],
    ['path', { d: 'M10.5 18h3', key: 'sand' }],
  ]),
);

/** Running low: the same jar with a low level line and a down arrow. Lit amber (--lamp-low). */
export const LampLowIcon = lucide(
  createLucideIcon('LampLow', [
    ['rect', JAR_LID],
    ['path', { d: JAR_BODY, key: 'jar' }],
    ['path', { d: 'M5.5 17.8h13', key: 'level' }],
    ['path', { d: 'M12 9.2v5.2', key: 'stem' }],
    ['path', { d: 'M9.7 12.2l2.3 2.3 2.3-2.3', key: 'head' }],
  ]),
);

/** Fresh in: an arrow dropping into a basket. Lit green (--lamp-fresh). */
export const LampFreshIcon = lucide(
  createLucideIcon('LampFresh', [
    ['path', { d: 'M12 2.5V11', key: 'stem' }],
    ['path', { d: 'M8.5 7.5 12 11l3.5-3.5', key: 'head' }],
    ['path', { d: BASKET, key: 'basket' }],
  ]),
);

/** Stale: the same basket asleep ("z z"). Takes the Fresh in position. Lit cool grey (--lamp-stale). */
export const LampStaleIcon = lucide(
  createLucideIcon('LampStale', [
    ['path', { d: 'M7 4.5h5.5l-5.5 6h5.5', key: 'z-big' }],
    ['path', { d: 'M15.5 2.5h3.5l-3.5 4h3.5', key: 'z-small' }],
    ['path', { d: BASKET, key: 'basket' }],
  ]),
);

/** Which pictogram each light uses (reference/healthLights.ts → HealthLightId). */
export const HEALTH_LIGHT_ICONS = {
  expired: LampExpiredIcon,
  soon: LampSoonIcon,
  low: LampLowIcon,
  fresh: LampFreshIcon,
  stale: LampStaleIcon,
} as const;

// `lucide` is the local wrapper already defined in icons.tsx; shown here for reference only.
declare function lucide<T>(icon: T): T;

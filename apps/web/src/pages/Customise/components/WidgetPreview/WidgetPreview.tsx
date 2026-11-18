import {
  Box,
  ClockIcon,
  PantryIcon,
  RecipesIcon,
  ShoppingIcon,
  tokens,
  radius,
} from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import {
  BAR_RADIUS,
  HATCH,
} from '@/components/mealPlan/MealPlanPopover/barStyle';
import type { WidgetType } from '@/lib/dashboard';

const bar = (width: string, color: string) => (
  <Box
    component="span"
    sx={{
      display: 'block',
      width,
      height: 7,
      borderRadius: radius.tag,
      bgcolor: color,
    }}
  />
);

const centred = (icon: ReactNode) => (
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    {icon}
  </Box>
);

/** Decorative mini preview of a Widget type for the Add widgets gallery. */
const PREVIEWS: Record<WidgetType, ReactNode> = {
  'use-soon': centred(<ClockIcon size={30} />),
  shopping: centred(<ShoppingIcon size={30} />),
  'pantry-stock': centred(<PantryIcon size={30} />),
  suggestions: centred(<ShoppingIcon size={30} />),
  'cook-tonight': centred(<RecipesIcon size={30} />),
  // Week columns: three bars per day, covered, short or on list, as the Widget draws them.
  'meal-plan': (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
        gap: '4px',
        justifyItems: 'center',
        alignContent: 'center',
        height: '100%',
      }}
    >
      {[
        [tokens.color.accent, tokens.color.accent, tokens.color.accent],
        [tokens.color.accent, tokens.color.urgentFg, tokens.color.accent],
        [tokens.color.accent, tokens.color.urgentFg, tokens.color.urgentFg],
        [tokens.color.accent, HATCH, HATCH],
        [tokens.color.accent, tokens.color.accent, tokens.color.accent],
      ].map((bars, day) => (
        <Box
          key={day}
          component="span"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            width: '100%',
            maxWidth: 30,
          }}
        >
          {bars.map((fill, i) => (
            <Box
              key={i}
              component="span"
              sx={{
                display: 'block',
                height: 7,
                borderRadius: BAR_RADIUS,
                background: fill,
              }}
            />
          ))}
        </Box>
      ))}
    </Box>
  ),
  budget: (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
      }}
    >
      {bar('50%', tokens.color.ink)}
      {bar('68%', tokens.color.accent)}
    </Box>
  ),
  nutrition: (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '6px',
        height: '100%',
      }}
    >
      {bar('80%', tokens.color.accent)}
      {bar('55%', tokens.color.accentMid)}
      {bar('35%', tokens.color.butter)}
    </Box>
  ),
};

export function WidgetPreview({ type }: { type: WidgetType }) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        height: 64,
        borderRadius: radius.control,
        bgcolor: tokens.color.bg,
        color: tokens.color.ink,
        p: '12px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        '& > *': { width: '100%' },
      }}
    >
      {PREVIEWS[type]}
    </Box>
  );
}

import {
  Box,
  ClockIcon,
  PantryIcon,
  RecipesIcon,
  ShoppingIcon,
  radius,
  palette,
  shade,
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
        [palette('pp-accent'), palette('pp-accent'), palette('pp-accent')],
        [palette('pp-accent'), palette('error-main'), palette('pp-accent')],
        [palette('pp-accent'), palette('error-main'), palette('error-main')],
        [palette('pp-accent'), HATCH, HATCH],
        [palette('pp-accent'), palette('pp-accent'), palette('pp-accent')],
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
      {bar('50%', palette('text-primary'))}
      {bar('68%', palette('pp-accent'))}
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
      {bar('80%', palette('pp-accent'))}
      {bar('55%', shade.accentMid)}
      {bar('35%', palette('secondary-main'))}
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
        bgcolor: palette('background-default'),
        color: palette('text-primary'),
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

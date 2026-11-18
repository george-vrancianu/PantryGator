import { nestedRadius, radius, palette } from '@pocket-pantry/ui';
import type { BarStatus } from '@/lib/mealPlan';

/** The "on list" fill: stripes in the star and soon colours. */
export const HATCH = `repeating-linear-gradient(135deg, ${palette('pp-star')} 0 3px, ${palette('warning-light')} 3px 6px)`;

/** How a bar of the Meal plan Widget is filled, by its slot's status. */
export const BAR_FILL: Record<BarStatus, object> = {
  covered: { backgroundColor: palette('pp-accent') },
  short: { backgroundColor: palette('error-main') },
  onList: { background: HATCH },
  // Nothing planned, or a Recipe that is gone: an empty outline.
  empty: { boxShadow: `inset 0 0 0 1px ${palette('divider')}` },
  unavailable: { boxShadow: `inset 0 0 0 1px ${palette('divider')}` },
};

/** A bar's corner radius: small, and following the Theme's control radius. */
export const BAR_RADIUS = nestedRadius(radius.control, 9);

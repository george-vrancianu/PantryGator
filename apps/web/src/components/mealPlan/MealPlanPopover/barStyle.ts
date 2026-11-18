import { nestedRadius, radius, tokens } from '@pocket-pantry/ui';
import type { BarStatus } from '@/lib/mealPlan';

/** The "on list" fill: stripes in the star and soon colours. */
export const HATCH = `repeating-linear-gradient(135deg, ${tokens.color.star} 0 3px, ${tokens.color.soonBg} 3px 6px)`;

/** How a bar of the Meal plan Widget is filled, by its slot's status. */
export const BAR_FILL: Record<BarStatus, object> = {
  covered: { backgroundColor: tokens.color.accent },
  short: { backgroundColor: tokens.color.urgentFg },
  onList: { background: HATCH },
  // Nothing planned, or a Recipe that is gone: an empty outline.
  empty: { boxShadow: `inset 0 0 0 1px ${tokens.color.divider}` },
  unavailable: { boxShadow: `inset 0 0 0 1px ${tokens.color.divider}` },
};

/** A bar's corner radius: small, and following the Theme's control radius. */
export const BAR_RADIUS = nestedRadius(radius.control, 9);

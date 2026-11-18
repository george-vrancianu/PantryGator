import type { TagTone } from '@pocket-pantry/ui';
import type { SlotStatus } from '@/lib/mealPlan';
import type { PantryLineStatus } from '@/lib/recipes';

/** The tone of a Meal Plan forecast status; the one table behind the Popover, the Widget and the Plan page. */
export const slotStatusTone: Record<SlotStatus, TagTone> = {
  covered: 'accent',
  onList: 'soon',
  short: 'urgent',
  unavailable: 'neutral',
};

/** An item already on the Shopping List reads the same wherever it shows: the `onList` tone. */
export const onListTone: TagTone = slotStatusTone.onList;

/** The tone of a Recipe line's Pantry status. A line that is only short is "soon" (the Member can still buy it); a missing one is urgent. */
export const pantryLineTone: Record<PantryLineStatus, TagTone> = {
  covered: 'accent',
  short: 'soon',
  missing: 'urgent',
};

/** A Pantry Basic is always fine, whatever its status. */
export const pantryBasicTone: TagTone = 'ok';

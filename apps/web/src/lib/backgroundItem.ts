import type { ReactNode } from 'react';
import type { RecipeReadKind } from './recipeReads';

/**
 * What kinds of item the background holds. Voice Notes are the first kind; the Scan Session (receipt or
 * photo) is the second; the recipe reads (the recipe-read holder) bring their own kinds, `link` for now.
 */
export type BackgroundKind = 'voice' | 'receipt' | 'photo' | RecipeReadKind;

export type BackgroundStatus = 'reading' | 'ready' | 'failed';

/** A button on a sheet row. Runs with the sheet's focus handling; the item's kind brings the callback. */
export type BackgroundAction =
  | {
      type: 'button';
      label: string;
      ariaLabel?: string;
      tone: 'primary' | 'secondary';
      /** Closes the sheet first: the action takes the Member somewhere else. */
      closesSheet?: boolean;
      onClick: () => void;
    }
  | {
      /** A menu of choices behind an icon (for example Retry in another language). */
      type: 'menu';
      label: string;
      icon: ReactNode;
      items: Array<{ label: string; current?: boolean; onClick: () => void }>;
    };

export type BackgroundItem = {
  kind: BackgroundKind;
  id: string;
  /** Its own title: what the strip shows alone and the sheet row leads with. */
  title: string;
  /** Its own detail line. */
  detail: string;
  status: BackgroundStatus;
  /** Ordering key (ms since the epoch, or any number that grows with time): rows show newest first. */
  createdAt: number;
  /** Optional art for the strip (when it leads) and the row; a kind without art leaves it empty. */
  art?: ReactNode;
  /** Opens the item's own Review (or See). A Voice Note offers it once ready; the Scan Session always. */
  open?: { label: string; ariaLabel?: string; onClick: () => void };
  /** The other row buttons, left to right: Cancel, Discard, Retry. */
  actions: BackgroundAction[];
};

export type BackgroundCounts = {
  reading: number;
  ready: number;
  failed: number;
  total: number;
};

export function countBackground(items: BackgroundItem[]): BackgroundCounts {
  const reading = items.filter((i) => i.status === 'reading').length;
  const ready = items.filter((i) => i.status === 'ready').length;
  const failed = items.filter((i) => i.status === 'failed').length;
  return { reading, ready, failed, total: items.length };
}

/** Newest first, ties by id so the order holds still. */
export const newestFirst = (items: BackgroundItem[]): BackgroundItem[] =>
  [...items].sort(
    (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id),
  );

let lastOrder = 0;
/**
 * One clock for every kind of background item: later calls always return larger numbers (the time
 * in ms, bumped past the last one when two come in the same millisecond), so rows from different
 * holders sort newest first against each other.
 */
export function nextBackgroundOrder(): number {
  lastOrder = Math.max(Date.now(), lastOrder + 1);
  return lastOrder;
}

import { useCallback, useState } from 'react';
import { useRowHint, type RowHint } from '@/lib/useRowHint';

/** The Pantry's first-use hint, and which expanded roll-up its first Batch row belongs to. */
export type PantryRowHint = {
  hint: RowHint;
  /** The roll-up expanded first (and still open): its first Batch peeks. */
  leader: string | null;
  /** A roll-up reports that it is open (showing Batch rows) or not. */
  setOpen: (id: string, open: boolean) => void;
};

/**
 * Only the Batch rows inside an expanded roll-up swipe, so the hint waits for the first expansion instead
 * of showing when the Pantry mounts.
 */
export function usePantryRowHint(): PantryRowHint {
  const [open, setOpenIds] = useState<string[]>([]);
  const hint = useRowHint('pantry', open.length > 0);
  const setOpen = useCallback((id: string, isOpen: boolean) => {
    setOpenIds((current) => {
      if (isOpen) return current.includes(id) ? current : [...current, id];
      return current.includes(id) ? current.filter((x) => x !== id) : current;
    });
  }, []);
  return { hint, leader: open[0] ?? null, setOpen };
}

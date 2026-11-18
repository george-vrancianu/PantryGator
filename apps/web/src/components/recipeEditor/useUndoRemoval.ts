import { useToast, type ToastHandle } from '@pocket-pantry/ui';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { UNDO_WINDOW_MS } from '@/lib/useDeferredRemoval';

/**
 * Removing a row of a draft list shows an Undo toast that puts it back at its old index.
 * Undo builds on the newest list, only one toast shows at a time, and the toast goes
 * when the page does or when the form is reseeded (`seedKey` changes): a reseeded list
 * has new keys and may no longer hold the removed row's id, so Undo would bring back a
 * row the server does not know.
 */
export function useUndoRemoval<T extends { key: number }>(
  items: T[],
  onChange: (items: T[]) => void,
  seedKey?: string,
) {
  const { t } = useTranslation('common');
  const toast = useToast();
  const latest = useRef({ items, onChange });
  useLayoutEffect(() => {
    latest.current = { items, onChange };
  });
  const undoToast = useRef<ToastHandle | null>(null);
  const close = () => undoToast.current?.close();
  useEffect(() => close, []);
  const seeded = useRef(seedKey);
  useEffect(() => {
    if (seeded.current === seedKey) return;
    seeded.current = seedKey;
    close();
  }, [seedKey]);

  /** Takes `item` (at `index`) out of the list and offers Undo; `name` is what the toast calls it. */
  return (item: T, index: number, name: string) => {
    latest.current.onChange(
      latest.current.items.filter((other) => other.key !== item.key),
    );
    close();
    undoToast.current = toast.show(t('row.removed', { name }), {
      polite: true,
      duration: UNDO_WINDOW_MS,
      action: {
        label: t('row.undo'),
        onClick: () => {
          const now = latest.current;
          if (now.items.some((other) => other.key === item.key)) return;
          const at = Math.min(index, now.items.length);
          now.onChange([
            ...now.items.slice(0, at),
            item,
            ...now.items.slice(at),
          ]);
        },
      },
    });
  };
}

import { useToast, type ToastOptions } from '@pocket-pantry/ui';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/** How long a removal can be undone, ms. */
export const UNDO_WINDOW_MS = 5000;

/** What a caller may add to the shared Undo options. */
type UndoExtras = Pick<ToastOptions, 'bottom' | 'onClose'>;

/**
 * The one place an Undo toast is built: the standard window, an Undo button, and the polite live
 * region (a status, never an alert). `undoOptions` gives the options for `toast.show` when the Undo
 * is conditional; `showUndo` shows the toast and returns its handle.
 */
export function useUndoToast() {
  const toast = useToast();
  const { t } = useTranslation('common');

  const undoOptions = useCallback(
    (onUndo: () => void, extras?: UndoExtras): ToastOptions => ({
      ...extras,
      duration: UNDO_WINDOW_MS,
      polite: true,
      action: { label: t('row.undo'), onClick: onUndo },
    }),
    [t],
  );

  const showUndo = useCallback(
    (message: string, onUndo: () => void, extras?: UndoExtras) =>
      toast.show(message, undoOptions(onUndo, extras)),
    [toast, undoOptions],
  );

  return { undoOptions, showUndo };
}

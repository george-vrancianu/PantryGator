import { useToast } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { useRowToggleOutcome } from '@/components/lists/RowToggleErrors/RowToggleErrors';
import { useSetRunningLow } from '@/lib/pantry';
import { useUndoToast } from '@/lib/useUndoToast';

export type RunningLowChange = {
  ingredientId: string;
  /** The Ingredient's name, for the toast. */
  name: string;
  /** The flag as it will be. */
  on: boolean;
};

/**
 * Flags an Ingredient as running low, or clears it, and says so in a toast: "{name} marked running
 * low" / "{name} no longer running low". With `undo` (the swipe and its `L` key) the toast offers
 * Undo for 5 s, which sends the opposite change. A failed save is reported to the page's Alert.
 */
export function useRunningLowToggle() {
  const { t } = useTranslation('pantry');
  const save = useSetRunningLow();
  const toast = useToast();
  const { undoOptions } = useUndoToast();
  const outcome = useRowToggleOutcome();

  const send = (ingredientId: string, on: boolean) =>
    save.mutate({ ingredientId, on }, outcome());

  return {
    toggle: (
      { ingredientId, name, on }: RunningLowChange,
      { undo = false }: { undo?: boolean } = {},
    ) => {
      send(ingredientId, on);
      toast.show(
        t(on ? 'toast.low.on' : 'toast.low.off', { name }),
        undo ? undoOptions(() => send(ingredientId, !on)) : { polite: true },
      );
    },
    isPending: save.isPending,
  };
}

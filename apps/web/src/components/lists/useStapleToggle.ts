import { isPendingStaple, useStapleMutations, useStaples } from '@/lib/staples';
import { useRowToggleOutcome } from './RowToggleErrors/RowToggleErrors';

/**
 * Whether an Ingredient is a Staple, from the Staples query, and a toggle that adds it or removes it
 * by its Staple id. `onSaved` runs once the server has accepted the change, with the new state; a
 * refusal goes to the page's row-toggle error. The toggle does nothing until `ready`: an add in
 * flight (from any row) has no server id yet to remove by.
 */
export function useStapleToggle(
  ingredientId: string,
  name: string,
  onSaved?: (isStaple: boolean) => void,
) {
  const staples = useStaples();
  const { add, remove } = useStapleMutations();
  const outcome = useRowToggleOutcome();
  const staple = staples.data?.find((s) => s.ingredientId === ingredientId);
  // An add started from another row of this Ingredient shows as a placeholder: not ready either.
  const ready =
    staples.data !== undefined &&
    !add.isPending &&
    !remove.isPending &&
    !(staple && isPendingStaple(staple));

  return {
    isStaple: staple !== undefined,
    ready,
    toggle: () => {
      if (!ready) return;
      if (staple)
        remove.mutate(
          staple.id,
          outcome(() => onSaved?.(false)),
        );
      else
        add.mutate(
          { ingredientId, name },
          outcome(() => onSaved?.(true)),
        );
    },
  };
}

export type StapleToggleState = ReturnType<typeof useStapleToggle>;

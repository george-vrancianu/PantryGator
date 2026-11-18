import { useToast } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { useStapleToggle } from '@/components/lists/useStapleToggle';

/**
 * An Ingredient row's Staple state and toggle, for its chip and its `S` key. The change shows at
 * once; the toast, "{name} is a Staple" / "{name} is no longer a Staple" (no Undo), waits for the
 * server, so a refused change never leaves a toast saying otherwise.
 */
export function usePantryStaple(ingredientId: string, name: string) {
  const { t } = useTranslation('pantry');
  const toast = useToast();
  return useStapleToggle(ingredientId, name, (isStaple) =>
    toast.show(t(isStaple ? 'toast.staple.on' : 'toast.staple.off', { name })),
  );
}

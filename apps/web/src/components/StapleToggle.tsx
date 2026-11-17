import { IconButton, StapleStar } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { useStapleToggle } from './useStapleToggle';

type Props = {
  ingredientId: string;
  /** The Ingredient's display name, for the button's accessible name. */
  name: string;
  /** Called after the change is saved, with whether the Ingredient is now a Staple. */
  onToggled?: (isStaple: boolean) => void;
};

/** A ★ that marks an Ingredient as a Staple, or unmarks it. Unmatched names have no toggle. */
export function StapleToggle({ ingredientId, name, onToggled }: Props) {
  const { t } = useTranslation('staples');
  const staple = useStapleToggle(ingredientId, name, onToggled);

  return (
    <IconButton
      label={t(staple.isStaple ? 'toggle.remove' : 'toggle.add', { name })}
      aria-pressed={staple.isStaple}
      tone="plain"
      size={40}
      ariaDisabled={!staple.ready}
      onClick={staple.toggle}
    >
      <StapleStar on={staple.isStaple} />
    </IconButton>
  );
}

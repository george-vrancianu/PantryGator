import {
  Box,
  CheckIcon,
  PlusIcon,
  radius,
  tokens,
  usePrefersReducedMotion,
} from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { familyRecipeHref } from '@/lib/recipeHref';
import type { AddState } from '@/lib/addToFamily';

type Props = {
  title: string;
  state: AddState;
  onAdd: () => void;
};

/** A 44 pt square, the touch target (Canopy handoff 7.6). */
const SIZE = 44;

/**
 * The one-tap Add to Family button of a Catalog Recipe (handoff section 3.3, Canopy 7.6): a plus until the
 * Recipe is added, then a check that opens the Family's copy. Its name changes with its state.
 * The check pops on the tap that added it, and not at all under reduced motion.
 */
export function AddToFamilyButton({ title, state, onAdd }: Props) {
  const { t } = useTranslation('recipes');
  const reduceMotion = usePrefersReducedMotion();
  const [popped, setPopped] = useState(false);
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: SIZE,
    height: SIZE,
    boxSizing: 'border-box',
    borderRadius: radius.control,
    p: 0,
    cursor: 'pointer',
    textDecoration: 'none',
    font: 'inherit',
  } as const;
  const hover = {
    '&:hover': {
      bgcolor: tokens.color.accentTint,
      color: tokens.color.accentOnTint,
    },
  } as const;
  if (state.status === 'none') {
    return (
      <Box
        component="button"
        type="button"
        aria-label={t('explore.add', { title })}
        onClick={() => {
          setPopped(true);
          onAdd();
        }}
        sx={{
          ...base,
          color: tokens.color.accent,
          border: `1.5px solid ${tokens.color.accent}`,
          bgcolor: tokens.color.surface,
          ...hover,
        }}
      >
        <PlusIcon size={18} />
      </Box>
    );
  }
  const added = {
    ...base,
    border: 0,
    bgcolor: tokens.color.accentTint,
    color: tokens.color.accentOnTint,
  };
  const check = (
    <Box
      aria-hidden
      sx={{
        display: 'flex',
        ...(popped && !reduceMotion
          ? {
              animation: 'ppAddPop 360ms',
              '@keyframes ppAddPop': {
                '0%': { transform: 'scale(1)' },
                '45%': { transform: 'scale(1.35)' },
                '100%': { transform: 'scale(1)' },
              },
            }
          : {}),
      }}
    >
      <CheckIcon size={18} />
    </Box>
  );
  const name = t('explore.openCopy', { title });
  // The copy's id arrives with the reply; until then the check is shown but there is nowhere to go.
  return state.status === 'added' ? (
    <Box
      component={Link}
      to={familyRecipeHref(state.copyId)}
      aria-label={name}
      sx={added}
    >
      {check}
    </Box>
  ) : (
    <Box
      component="button"
      type="button"
      aria-label={name}
      aria-disabled
      aria-busy
      sx={added}
    >
      {check}
    </Box>
  );
}

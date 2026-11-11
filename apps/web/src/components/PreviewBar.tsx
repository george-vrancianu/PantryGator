import {
  Box,
  BranchIcon,
  Button,
  CheckIcon,
  gutterLeft,
  gutterRight,
  plusBottomInset,
  PlusIcon,
  tokens,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { familyRecipeHref } from '../lib/recipeHref';
import type { AddState } from '../lib/addToFamily';

/** Height the bar takes, px, so the page can leave room under its content and toasts can sit above it. */
export const PREVIEW_BAR_HEIGHT = 100;
/** The same, as a CSS `bottom` that also clears the device's bottom inset. */
export const PREVIEW_BAR_CLEARANCE = plusBottomInset(PREVIEW_BAR_HEIGHT);

type Props = {
  /** The previewed Recipe's id: Make a Variant opens `/recipes/{id}/variant/new` (a Variant branches from its Base). */
  recipeId: string;
  /** The Recipe's title, to name the added button. */
  title: string;
  /** Whether the Recipe can have a Variant made of it (its Base is not archived). */
  canMakeVariant?: boolean;
  state: AddState;
  onAdd: () => void;
};

/**
 * The bottom action bar of a Catalog Recipe's preview, in the Dock's place: Make a Variant, and Add to
 * family, which turns into the tinted "In your Recipes" that opens the copy.
 */
export function PreviewBar({
  recipeId,
  title,
  canMakeVariant = true,
  state,
  onAdd,
}: Props) {
  const { t } = useTranslation('recipes');
  return (
    <Box
      component="nav"
      aria-label={t('preview.actions')}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 5,
        bgcolor: tokens.color.bg,
        borderTop: `1px solid ${tokens.color.line}`,
        pl: gutterLeft(16),
        pr: gutterRight(16),
        pt: '12px',
        pb: plusBottomInset(26),
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '10px',
      }}
    >
      {canMakeVariant ? (
        <Button
          variant="secondary"
          fullWidth
          href={`/recipes/${recipeId}/variant/new`}
          startIcon={<BranchIcon size={18} />}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {t('family.makeVariant')}
        </Button>
      ) : (
        <span />
      )}
      {state.status === 'none' ? (
        <Button
          variant="primary"
          fullWidth
          onClick={onAdd}
          startIcon={<PlusIcon size={18} />}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {t('preview.addShort')}
        </Button>
      ) : state.status === 'added' ? (
        <Button
          variant="tonal"
          fullWidth
          href={familyRecipeHref(state.copyId)}
          aria-label={t('explore.openCopy', { title })}
          startIcon={<CheckIcon size={18} />}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {t('preview.inFamily')}
        </Button>
      ) : (
        <Button
          variant="tonal"
          fullWidth
          aria-label={t('explore.openCopy', { title })}
          aria-disabled
          aria-busy
          startIcon={<CheckIcon size={18} />}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {t('preview.inFamily')}
        </Button>
      )}
    </Box>
  );
}

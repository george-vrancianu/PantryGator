import { Box, CloseIcon, IconButton, tokens, radius } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogSearchResult } from '@/lib/catalog';
import { IngredientIconSlot } from '@/components/catalog/IngredientIconSlot/IngredientIconSlot';
import { FamilyTag } from '../FamilyTag/FamilyTag';
import { resultMeta } from '../SearchResultRow/SearchResultRow';

/** The picked ingredient as a tinted pill with icon, name, meta and ×; tapping it clears the pick. */
export function SelectedToken({
  selected,
  onClear,
  tag,
  meta,
}: {
  selected: CatalogSearchResult;
  onClear: () => void;
  /** A pill after the name, e.g. where the pick came from. */
  tag?: ReactNode;
  /** Replaces the "{leaf} · {aisle}" line. */
  meta?: string;
}) {
  const { color } = tokens;
  const { t } = useTranslation('catalog');
  return (
    <Box
      data-testid="selected-token"
      // Focus stays in the (visually hidden) input.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClear}
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        pl: '12px',
        pr: '6px',
        borderRadius: radius.control,
        backgroundColor: color.accentTint,
        color: color.accentOnTint,
        cursor: 'pointer',
      }}
    >
      <IngredientIconSlot
        ingredientId={selected.id}
        aisleId={selected.parentCategory.aisle.id}
        color={color.accent}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          sx={{
            fontSize: 15,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            minWidth: 0,
          }}
        >
          <Box
            component="span"
            sx={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {selected.name}
          </Box>
          <Box
            component="span"
            sx={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}
          >
            {selected.owner === 'family' ? <FamilyTag /> : null}
            {tag}
          </Box>
        </Box>
        <Box
          sx={{
            fontSize: 12,
            fontWeight: 500,
            opacity: 0.8,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {meta ?? resultMeta(selected)}
        </Box>
      </Box>
      <IconButton
        label={t('search.change')}
        tone="plain"
        size={34}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation();
          onClear();
        }}
      >
        <CloseIcon size={18} />
      </IconButton>
    </Box>
  );
}

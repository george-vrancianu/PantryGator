import { Box, CloseIcon, palette, focusRing, radius } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import type { CatalogAisle } from '@/lib/catalog';
import { AisleSwatch } from '../AisleSwatch/AisleSwatch';

export type AisleViewHeaderProps = {
  aisle: CatalogAisle;
  /** The Parent Category the rows are narrowed to, if any. */
  parentCategoryId: string | null;
  onParentCategory: (id: string | null) => void;
  /** The text filtering within the Aisle. */
  query: string;
  /** The row count once the rows for `query` have loaded, else null (still loading). */
  count: number | null;
  onLeave: () => void;
  /** The search failed: the error row says so, so the status line stays quiet. */
  failed?: boolean;
};

/** The head of the aisle view: swatch, name, status line, Leave ×, and Parent Category chips when there are several. */
export function AisleViewHeader({
  aisle,
  parentCategoryId,
  onParentCategory,
  query,
  count,
  onLeave,
  failed = false,
}: AisleViewHeaderProps) {
  const { t } = useTranslation('catalog');
  let status = failed ? '' : t('search.aisleLoading');
  if (count !== null) {
    status = query
      ? t('search.aisleMatching', { query })
      : t('search.aisleCount', { count });
  }
  return (
    <Box
      onMouseDown={(event) => event.preventDefault()}
      sx={{ backgroundColor: palette('pp-subtle') }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          p: '10px 10px 10px 14px',
        }}
      >
        <AisleSwatch aisleId={aisle.id} size={12} />
        <Box sx={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>
          {aisle.name}
          <Box
            sx={{
              fontSize: 12,
              fontWeight: 500,
              color: palette('text-secondary'),
              mt: '2px',
            }}
          >
            {status}
          </Box>
        </Box>
        <Box
          component="button"
          type="button"
          aria-label={t('search.leaveAisle', { aisle: aisle.name })}
          onClick={onLeave}
          sx={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 0,
            backgroundColor: 'transparent',
            color: palette('text-secondary'),
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            ...focusRing,
          }}
        >
          <CloseIcon size={16} />
        </Box>
      </Box>
      {aisle.parentCategories.length > 1 ? (
        <Box
          sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, p: '0 14px 10px' }}
        >
          {aisle.parentCategories.map((parent) => {
            const on = parent.id === parentCategoryId;
            return (
              <Box
                key={parent.id}
                component="button"
                type="button"
                aria-pressed={on}
                onClick={() => onParentCategory(on ? null : parent.id)}
                sx={{
                  minHeight: 30,
                  p: '0 12px',
                  borderRadius: radius.chip,
                  border: `1px solid ${on ? palette('pp-accent') : palette('pp-line')}`,
                  backgroundColor: on
                    ? palette('pp-accentTint')
                    : palette('background-paper'),
                  color: on
                    ? palette('pp-accentOnTint')
                    : palette('text-primary'),
                  font: 'inherit',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  ...focusRing,
                }}
              >
                {parent.name}
              </Box>
            );
          })}
        </Box>
      ) : null}
    </Box>
  );
}

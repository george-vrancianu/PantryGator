import { Box, palette, focusRing, radius } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { useCatalogAisles } from '@/lib/catalog';
import { AisleSwatch } from '../../AisleSwatch/AisleSwatch';
import { useEmptyStateSearch } from '../context';

/**
 * "Browse by aisle": one chip per Aisle. Tapping one opens that Aisle's
 * Ingredients in the enclosing CatalogSearch's list. Takes no props: it reads
 * the search through `useEmptyStateSearch`, and renders nothing outside one
 * or until the Aisles have loaded.
 */
export function BrowseByAisle() {
  const { t } = useTranslation('catalog');
  const browse = useEmptyStateSearch();
  const aisles = useCatalogAisles(browse?.scope, browse !== null);
  if (!browse || !aisles.data || aisles.data.length === 0) return null;
  return (
    <Box sx={{ borderTop: `1px solid ${palette('divider')}`, pt: 1.5 }}>
      <Box
        sx={{
          fontSize: 12,
          fontWeight: 600,
          color: palette('text-secondary'),
          mb: 1,
        }}
      >
        {t('search.browseAisles')}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {aisles.data.map((aisle) => (
          <Box
            key={aisle.id}
            component="button"
            type="button"
            onClick={() => browse.openAisle(aisle)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              minHeight: 36,
              p: '0 12px',
              borderRadius: radius.chip,
              border: `1px solid ${palette('pp-line')}`,
              backgroundColor: palette('background-paper'),
              color: palette('text-primary'),
              font: 'inherit',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: 'pointer',
              ...focusRing,
            }}
          >
            <AisleSwatch aisleId={aisle.id} size={10} />
            {aisle.name}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

import { Box, PantryIcon, radius, stockBar, tokens } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '../../../i18n/translateApiError';
import { groupByLocation, useBatches } from '../../../lib/pantry';
import { WidgetCard, WidgetFigure, WidgetTitle } from './WidgetCard';
import type { WidgetProps } from './types';

/** The bar's three segment colours, in the order of the Locations that hold something. */
const SEGMENT_COLORS = [
  tokens.color.accent,
  stockBar.second,
  stockBar.third,
] as const;

/** Total Batches and a stacked bar of how they split across Locations. */
export function PantryStockWidget({ size, columns }: WidgetProps) {
  const { t } = useTranslation('dashboard');
  const batches = useBatches();
  const stock = groupByLocation(batches.data ?? []).map((group) => ({
    location: group.location,
    count: group.batches.length,
  }));
  const filled = stock.filter(({ count }) => count > 0);
  const labels = stock.map(
    ({ location, count }) => `${t(`common:locations.${location}`)} ${count}`,
  );
  const total = batches.data?.length ?? 0;

  return (
    <WidgetCard
      label={t('widgets.pantryStock.title')}
      size={size}
      columns={columns}
      to="/pantry"
      isLoading={batches.isPending}
      error={batches.error ? translateApiError(t, batches.error) : null}
    >
      <WidgetTitle icon={<PantryIcon size={14} />}>
        {t('widgets.pantryStock.title')}
      </WidgetTitle>
      <WidgetFigure
        value={total}
        caption={t('widgets.pantryStock.itemsInStock', { count: total })}
      />
      <Box
        role="img"
        aria-label={labels.join(', ')}
        sx={{
          display: 'flex',
          gap: '3px',
          height: 4,
          mt: '12px',
        }}
      >
        {filled.map(({ location, count }, index) => (
          <Box
            key={location}
            component="span"
            sx={{
              flexGrow: count,
              bgcolor: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
              borderRadius: radius.bar,
            }}
          />
        ))}
      </Box>
      <Box
        component="p"
        sx={{
          m: 0,
          mt: '9px',
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1.35,
          color: tokens.color.muted,
          textWrap: 'balance',
        }}
      >
        {labels.join(' · ')}
      </Box>
    </WidgetCard>
  );
}

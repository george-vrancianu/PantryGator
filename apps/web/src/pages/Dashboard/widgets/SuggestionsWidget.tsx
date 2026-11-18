import { Box, ShoppingIcon, tokens } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import { localIso } from '@/lib/pantry';
import {
  goneInOrder,
  useSuggestions,
  WIDGET_SUGGESTION_COUNT,
} from '@/lib/suggestions';
import { WidgetCard, WidgetFigure, WidgetTitle } from './WidgetCard';
import type { WidgetProps } from './types';

/** How many Ingredients are gone from the Pantry, and the first few by name; the card opens the Shopping List. */
export function SuggestionsWidget({ size, columns }: WidgetProps) {
  const { t } = useTranslation('dashboard');
  // oxlint-disable-next-line react/purity -- "today" must follow the clock across midnight; freezing it would leave a Member on a stale day
  const suggestions = useSuggestions(localIso(new Date()));
  // Named in the order of the Shopping add sheet: expired, Used Up, then missing Staples.
  const all = suggestions.data
    ? goneInOrder(suggestions.data).map((entry) => entry.suggestion)
    : [];
  const names = all.slice(0, WIDGET_SUGGESTION_COUNT).map((s) => s.name);

  return (
    <WidgetCard
      label={t('widgets.suggestions.title')}
      size={size}
      columns={columns}
      to="/shopping"
      isLoading={suggestions.isPending}
      error={suggestions.error ? translateApiError(t, suggestions.error) : null}
    >
      <WidgetTitle icon={<ShoppingIcon size={14} />}>
        {t('widgets.suggestions.title')}
      </WidgetTitle>
      <WidgetFigure
        value={all.length}
        caption={t('widgets.suggestions.count', { count: all.length })}
      />
      <Box
        component="p"
        sx={{
          m: 0,
          mt: 'auto',
          pt: '8px',
          fontSize: 12,
          color: tokens.color.muted,
        }}
      >
        {names.length === 0
          ? t('widgets.suggestions.empty')
          : `${names.join(', ')}${all.length > names.length ? '…' : ''}`}
      </Box>
    </WidgetCard>
  );
}

import { Box, ShoppingIcon, hero } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '../../../i18n/translateApiError';
import { firstUncheckedNames } from '../../../lib/dashboard';
import { useShoppingList } from '../../../lib/shopping';
import { WidgetCard, WidgetFigure, WidgetTitle } from './WidgetCard';
import type { WidgetProps } from './types';

/** Unchecked Shopping Items on the dark hero card: the count and the first few names. */
export function ShoppingWidget({ size, columns }: WidgetProps) {
  const { t } = useTranslation('dashboard');
  const list = useShoppingList();
  const { names, hasMore } = list.data
    ? firstUncheckedNames(list.data)
    : { names: [], hasMore: false };

  return (
    <WidgetCard
      label={t('widgets.shopping.title')}
      size={size}
      columns={columns}
      tone="hero"
      to="/shopping"
      isLoading={list.isPending}
      error={list.error ? translateApiError(t, list.error) : null}
    >
      <WidgetTitle icon={<ShoppingIcon size={14} />} color={hero.muted}>
        {t('widgets.shopping.title')}
      </WidgetTitle>
      <WidgetFigure
        value={list.data?.summary.remaining ?? 0}
        caption={t('widgets.shopping.itemsToBuy', {
          count: list.data?.summary.remaining ?? 0,
        })}
        numberColor={hero.num}
      />
      <Box
        component="p"
        sx={{
          m: 0,
          mt: 'auto',
          pt: '8px',
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1.35,
          color: hero.muted,
        }}
      >
        {names.length === 0
          ? t('widgets.shopping.empty')
          : `${names.join(', ')}${hasMore ? '…' : ''}`}
      </Box>
    </WidgetCard>
  );
}

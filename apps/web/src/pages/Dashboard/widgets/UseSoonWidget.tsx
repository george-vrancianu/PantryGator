import { Box, ClockIcon, tokens } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { translateApiError } from '../../../i18n/translateApiError';
import { soonestExpiring } from '../../../lib/dashboard';
import { ExpiryTag } from '../../../components/ExpiryTag';
import { useBatches, useExpiryTags } from '../../../lib/pantry';
import { useToday } from '../../../lib/useToday';
import { WidgetCard, WidgetTitle } from './WidgetCard';
import type { WidgetProps } from './types';

/** The three soonest-expiring Batches (Expired ones first) with their ExpiryTags. */
export function UseSoonWidget({ size, columns }: WidgetProps) {
  const { t } = useTranslation('dashboard');
  const today = useToday();
  const batches = useBatches();
  const soonest = soonestExpiring(batches.data ?? []);
  const { tagFor } = useExpiryTags(today);

  return (
    <WidgetCard
      label={t('widgets.useSoon.title')}
      size={size}
      columns={columns}
      isLoading={batches.isPending}
      error={batches.error ? translateApiError(t, batches.error) : null}
      padding={batches.isPending || batches.error ? undefined : '0 16px 2px'}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 42,
        }}
      >
        <WidgetTitle icon={<ClockIcon size={14} />}>
          {t('widgets.useSoon.title')}
        </WidgetTitle>
        <Box
          component={Link}
          to="/pantry"
          sx={{
            display: 'flex',
            alignItems: 'center',
            minHeight: 44,
            fontSize: 13,
            fontWeight: 700,
            color: tokens.color.accent,
            textDecoration: 'none',
          }}
        >
          {t('widgets.useSoon.seeAll')}
        </Box>
      </Box>
      {soonest.length === 0 ? (
        <Box sx={{ fontSize: 14, color: tokens.color.muted, py: '10px' }}>
          {t('widgets.useSoon.empty')}
        </Box>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {soonest.map((batch) => {
            return (
              <Box
                component="li"
                key={batch.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  height: 44,
                  borderTop: `1px solid ${tokens.color.divider}`,
                }}
              >
                <Box
                  component="span"
                  sx={{
                    fontSize: 15,
                    fontWeight: 600,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {batch.name}
                </Box>
                <ExpiryTag tag={tagFor(batch.expiryDate)} />
              </Box>
            );
          })}
        </Box>
      )}
    </WidgetCard>
  );
}

import {
  Box,
  CloseIcon,
  displayType,
  IconButton,
  Sheet,
  tokens,
} from '@pocket-pantry/ui';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MIN_BATCHES_FOR_SCORE, presentFactors } from '../../lib/health';
import type { PantryHealthState } from '../../lib/usePantryHealth';
import { HealthGatorNote, useHealthGatorLine } from './HealthGator';
import { ScoreRing } from './HealthRing';
import { HealthTodos } from './HealthTodos';

type Props = {
  open: boolean;
  onClose: () => void;
  state: PantryHealthState;
  today: Date;
};

/** The Pantry health sheet. Its header carries the score; the Health To-dos come below. */
export function HealthSheet({ open, onClose, state, today }: Props) {
  const { health, batchCount } = state;
  const { t } = useTranslation('dashboard');
  const closeButton = useRef<HTMLButtonElement>(null);
  const gatorLine = useHealthGatorLine(
    health,
    state.todos,
    state.staleThresholdDays,
    today,
  );
  const missing = MIN_BATCHES_FOR_SCORE - batchCount;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      initialFocus={closeButton}
      label={t('health.title')}
      header={
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            p: '6px 18px 12px',
            borderBottom: `1px solid ${tokens.color.divider}`,
          }}
        >
          <ScoreRing health={health} batchCount={batchCount} size={52} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {health.scored ? (
              <>
                <Box sx={{ ...displayType, fontSize: 17 }}>
                  {t(`health.verdict.${health.verdict}`)}
                </Box>
                <Box sx={{ fontSize: 12.5, color: tokens.color.muted }}>
                  {presentFactors(health)
                    .map(([factor, value]) =>
                      t('health.factorValue', {
                        name: t(`health.factor.${factor}`),
                        value,
                      }),
                    )
                    .join(' · ')}
                </Box>
              </>
            ) : (
              <Box sx={{ ...displayType, fontSize: 15 }}>
                {t('health.progress', { count: missing })}
              </Box>
            )}
            {gatorLine ? (
              <HealthGatorNote
                health={health}
                line={gatorLine}
                sx={{ mt: '4px' }}
              />
            ) : null}
          </Box>
          <IconButton
            ref={closeButton}
            label={t('health.close')}
            tone="neutral"
            size={34}
            onClick={onClose}
          >
            <CloseIcon size={16} />
          </IconButton>
        </Box>
      }
    >
      <HealthTodos state={state} today={today} />
    </Sheet>
  );
}

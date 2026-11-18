import {
  Box,
  displayType,
  radius,
  segOff,
  Sheet,
  palette,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { MIN_BATCHES_FOR_SCORE, presentFactors, verdictOf } from '@/lib/health';
import type { PantryHealthState } from '@/lib/usePantryHealth';
import { HealthDial } from '../HealthDial/HealthDial';
import { VERDICT_COLOR } from './healthStyle';
import { HealthTodos } from './HealthTodos';

type Props = {
  open: boolean;
  onClose: () => void;
  state: PantryHealthState;
  today: Date;
};

/** The Pantry health sheet. The title row names it and carries the verdict; the score comes first in the body, then the Health To-dos. */
export function HealthSheet({ open, onClose, state, today }: Props) {
  const { health, batchCount } = state;
  const { t } = useTranslation('dashboard');
  const missing = MIN_BATCHES_FOR_SCORE - batchCount;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('health.title')}
      subtitle={
        health.scored
          ? t(`health.verdict.${health.verdict}`)
          : t('health.notEnough')
      }
    >
      <Box
        sx={{
          p: '6px 18px 14px',
          borderBottom: `1px solid ${palette('pp-line')}`,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <Box
            component="span"
            sx={{
              flex: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <HealthDial
              score={health.scored ? health.total : null}
              tone="sheet"
            />
            {health.scored ? (
              <Box
                component="span"
                data-testid="health-score"
                sx={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: palette('text-secondary'),
                }}
              >
                <ScoreOf total={health.total} />
              </Box>
            ) : null}
          </Box>
          {health.scored ? (
            <Box
              component="div"
              sx={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {presentFactors(health).map(([factor, value]) => (
                <Box
                  component="div"
                  key={factor}
                  data-factor={factor}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    height: 14,
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      width: 58,
                      flex: 'none',
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: palette('text-secondary'),
                    }}
                  >
                    {t(`health.factor.${factor}`)}
                  </Box>
                  <Box
                    component="span"
                    aria-hidden="true"
                    sx={{
                      flex: 1,
                      height: 6,
                      borderRadius: radius.tag,
                      background: segOff,
                      overflow: 'hidden',
                    }}
                  >
                    <Box
                      component="span"
                      data-testid={`factor-bar-${factor}`}
                      sx={{
                        display: 'block',
                        height: '100%',
                        width: `${value}%`,
                        borderRadius: radius.tag,
                        bgcolor: VERDICT_COLOR[verdictOf(value)],
                      }}
                    />
                  </Box>
                  <Box
                    component="span"
                    sx={{
                      width: 26,
                      flex: 'none',
                      textAlign: 'right',
                      ...displayType,
                      fontSize: 12.5,
                    }}
                  >
                    {value}
                  </Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Box sx={{ flex: 1, minWidth: 0, ...displayType, fontSize: 15 }}>
              {t('health.progress', { count: missing })}
            </Box>
          )}
        </Box>
      </Box>
      <HealthTodos state={state} today={today} />
    </Sheet>
  );
}

/** "96 of 100", with the number in the display face. */
function ScoreOf({ total }: { total: number }) {
  const { t } = useTranslation('dashboard');
  const text = t('health.scoreOf', { score: total });
  const at = text.indexOf(String(total));
  return (
    <>
      {text.slice(0, at)}
      <Box component="span" sx={{ ...displayType, fontSize: 14 }}>
        {total}
      </Box>
      {text.slice(at + String(total).length)}
    </>
  );
}

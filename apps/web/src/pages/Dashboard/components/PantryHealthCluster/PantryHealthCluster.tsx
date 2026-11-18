import {
  Box,
  canopy,
  canopyFocusRing,
  displayType,
  radius,
} from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HealthDial } from '../HealthDial/HealthDial';
import { HealthLamp } from '../HealthLamp/HealthLamp';
import { HealthSheet } from '../HealthSheet/HealthSheet';
import { expiringSoonDay, todoTitle } from '../HealthSheet/todoText';
import { translateApiError } from '@/i18n/translateApiError';
import { MIN_BATCHES_FOR_SCORE, type HealthTodoKey } from '@/lib/health';
import {
  healthLights,
  wholeDaysBetween,
  type HealthLight,
} from '@/lib/healthLights';
import { usePantryHealth, type PantryHealthState } from '@/lib/usePantryHealth';
import { useToday } from '@/lib/useToday';

/** Height of the cluster, so the header keeps its size while the data loads. */
const CLUSTER_HEIGHT = 92;

/** How many items a Health To-do holds; the lamp shows the same number as that To-do's title. */
const countOf = (state: PantryHealthState, key: HealthTodoKey) =>
  state.todos.find((todo) => todo.key === key)?.itemIds.length ?? 0;

/** The four lights. Below ten Batches there is nothing to judge, so every lamp is unlit. */
function lightsOf(state: PantryHealthState, today: Date): HealthLight[] {
  if (!state.health.scored)
    return [
      { id: 'expired', on: false, count: 0 },
      { id: 'soon', on: false, count: 0 },
      { id: 'low', on: false, count: 0 },
      { id: 'fresh', on: false, count: null },
    ];
  return healthLights({
    expired: countOf(state, 'expired'),
    useSoon: countOf(state, 'expiringSoon'),
    runningLow: countOf(state, 'runningLow'),
    lastStockedAt: state.lastStockedAt,
    today,
  });
}

/**
 * Pantry Health in the Dashboard header: the dial, the verdict, a one-line summary and four lights, as one button
 * that opens the Health Sheet. The Sheet gives focus back to the button when it closes.
 */
export function PantryHealthCluster() {
  const { t, i18n } = useTranslation('dashboard');
  const today = useToday();
  const state = usePantryHealth();
  const [open, setOpen] = useState(false);

  if (state.isPending)
    return (
      <Box
        aria-hidden="true"
        data-testid="health-cluster-loading"
        sx={{ minHeight: CLUSTER_HEIGHT }}
      />
    );
  if (state.error)
    return (
      <Box
        role="alert"
        sx={{
          minHeight: CLUSTER_HEIGHT,
          fontSize: 13,
          color: canopy.muted,
        }}
      >
        {translateApiError(t, state.error)}
      </Box>
    );

  const { health, todos } = state;
  const scored = health.scored;
  const lights = lightsOf(state, today);
  const verdict = scored
    ? t(`health.verdict.${health.verdict}`)
    : t('health.notEnough');
  const first = todos[0];
  const summary = !scored
    ? t('health.progress', {
        count: MIN_BATCHES_FOR_SCORE - state.batchCount,
      })
    : first
      ? t('health.toDoFirst', {
          count: todos.length,
          title: todoTitle(
            t,
            first,
            expiringSoonDay(today, state.staleThresholdDays, i18n.language),
          ),
        })
      : t('health.nothingToDo');

  const spoken = lights
    .filter((light) => light.on)
    .map((light) => {
      if (light.id === 'fresh') return t('health.a11y.fresh');
      if (light.id === 'nothingNew')
        return t('health.a11y.nothingNew', {
          count: wholeDaysBetween(
            new Date(state.lastStockedAt as string),
            today,
          ),
        });
      return t(`health.a11y.${light.id}`, { count: light.count ?? 0 });
    });
  const accessibleName = t('health.a11y.name', {
    title: t('health.title'),
    verdict,
    lights: spoken.length > 0 ? spoken.join(', ') : t('health.a11y.allClear'),
  });

  return (
    <>
      <Box
        component="button"
        type="button"
        aria-haspopup="dialog"
        aria-label={accessibleName}
        onClick={() => setOpen(true)}
        sx={{
          all: 'unset',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          width: '100%',
          minHeight: CLUSTER_HEIGHT,
          color: canopy.ink,
          cursor: 'pointer',
          borderRadius: radius.btn,
          ...canopyFocusRing,
        }}
      >
        <Box
          component="span"
          sx={{
            flex: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '9px',
          }}
        >
          <HealthDial
            score={scored ? health.total : null}
            tone="canopy"
            settle
          />
          <Box
            component="span"
            sx={{
              fontSize: 11,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: canopy.gold,
            }}
          >
            {t('health.title')}
          </Box>
        </Box>
        <Box
          component="span"
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '11px',
          }}
        >
          <Box
            component="span"
            sx={{ display: 'flex', flexDirection: 'column', gap: '5px' }}
          >
            <Box
              component="span"
              data-testid="health-verdict"
              sx={{
                ...displayType,
                fontSize: 20,
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
              }}
            >
              {verdict}
            </Box>
            <Box
              component="span"
              sx={{
                fontSize: 12.5,
                fontWeight: 500,
                lineHeight: 1.2,
                color: canopy.muted,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {summary}
            </Box>
          </Box>
          <Box component="span" sx={{ display: 'flex', gap: '8px' }}>
            {lights.map((light, index) => (
              <HealthLamp key={index} light={light} check />
            ))}
          </Box>
        </Box>
      </Box>
      <HealthSheet
        open={open}
        onClose={() => setOpen(false)}
        state={state}
        today={today}
      />
    </>
  );
}

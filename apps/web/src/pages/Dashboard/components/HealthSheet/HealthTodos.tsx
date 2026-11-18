import { Box, CheckIcon, palette, radius } from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HEALTH_TODO_KEYS,
  isForgotten,
  usualExpiryDate,
  type HealthTodo,
  type HealthTodoGroup,
  type HealthTodoKey,
} from '@/lib/health';
import { localIso, useExpiryTags } from '@/lib/pantry';
import type { PantryHealthState } from '@/lib/usePantryHealth';
import { expiringSoonDay, todoTitle } from './todoText';
import { todoItems } from './todoItems';
import { SetDateSheet } from './SetDateSheet';
import { TodoRow } from './TodoRow/TodoRow';
import { useAddToShoppingList } from './useAddToShoppingList';
import { useDateBatches } from './useDateBatches';

const GROUPS: HealthTodoGroup[] = ['now', 'week', 'tidy'];

type Props = {
  state: PantryHealthState;
  today: Date;
};

/** The Health To-dos grouped Now / This week / Tidy up, then a pill for each one with nothing to do. */
export function HealthTodos({ state, today }: Props) {
  const { t, i18n } = useTranslation('dashboard');
  const { tagFor } = useExpiryTags(today);
  const [openRow, setOpenRow] = useState<symbol | null>(null);
  const { todos, batches, staples, staleThresholdDays, tossBatches, markUsed } =
    state;
  const shopping = useAddToShoppingList(state);
  const dating = useDateBatches(state);
  const [settingDateId, setSettingDateId] = useState<string | null>(null);
  const day = expiringSoonDay(today, staleThresholdDays, i18n.language);
  const itemsOf = (todo: HealthTodo) =>
    todoItems(todo, {
      t,
      locale: i18n.language,
      today,
      batches,
      staples,
    });

  const firstGroup = GROUPS.find((group) =>
    todos.some((todo) => todo.group === group),
  );
  const todayIso = localIso(today);
  const doneKeys: Array<HealthTodoKey | 'rotation'> = [
    ...HEALTH_TODO_KEYS.filter(
      (key) => !todos.some((todo) => todo.key === key),
    ),
    ...(batches.some((batch) => isForgotten(batch, todayIso))
      ? []
      : (['rotation'] as const)),
  ];

  return (
    <Box sx={{ p: '4px 18px 30px' }}>
      {todos.length === 0 ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            py: '16px',
            fontSize: 13.5,
            color: palette('text-secondary'),
          }}
        >
          <Box
            aria-hidden="true"
            sx={{
              flexShrink: 0,
              width: 30,
              height: 30,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: palette('pp-accentTint'),
              color: palette('pp-accentOnTint'),
            }}
          >
            <CheckIcon size={16} />
          </Box>
          {t('health.allDone')}
        </Box>
      ) : null}
      {GROUPS.map((group) => {
        const inGroup = todos.filter((todo) => todo.group === group);
        if (inGroup.length === 0) return null;
        return (
          <Box component="section" key={group}>
            <Box
              component="h3"
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                m: 0,
                pt: group === firstGroup ? '2px' : '12px',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: palette('text-secondary'),
              }}
            >
              <span>{t(`health.group.${group}`)}</span>
              <span>{inGroup.length}</span>
            </Box>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {inGroup.map((todo) => (
                <TodoRow
                  key={todo.key}
                  todo={todo}
                  title={todoTitle(t, todo, day)}
                  items={itemsOf(todo)}
                  openRow={openRow}
                  onOpenChange={setOpenRow}
                  tagFor={tagFor}
                  onToss={tossBatches}
                  onUsed={markUsed}
                  shopping={shopping}
                  dating={dating}
                  canDateAll={batches.some(
                    (batch) =>
                      usualExpiryDate(batch, todayIso) !== null &&
                      todo.itemIds.includes(batch.id),
                  )}
                  onSetDate={setSettingDateId}
                />
              ))}
            </Box>
          </Box>
        );
      })}
      {doneKeys.length > 0 ? (
        <Box
          component="ul"
          sx={{
            listStyle: 'none',
            m: 0,
            p: 0,
            pt: '14px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
          }}
        >
          {doneKeys.map((key) => (
            <Box
              component="li"
              key={key}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                height: 28,
                p: '0 9px 0 7px',
                borderRadius: radius.tag,
                bgcolor: palette('success-light'),
                color: palette('success-main'),
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              <Box component="span" aria-hidden="true" sx={{ display: 'flex' }}>
                <CheckIcon size={13} />
              </Box>
              {t(`health.done.${key}`)}
            </Box>
          ))}
        </Box>
      ) : null}
      <SetDateSheet
        batch={batches.find((batch) => batch.id === settingDateId) ?? null}
        onClose={() => setSettingDateId(null)}
        onSave={(batch, expiryDate) => void dating.setDate(batch, expiryDate)}
      />
    </Box>
  );
}

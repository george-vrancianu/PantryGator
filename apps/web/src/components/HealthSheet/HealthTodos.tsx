import {
  BatteryLowIcon,
  Box,
  Button,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  color,
  CookIcon,
  DeleteIcon,
  HourglassIcon,
  IconButton,
  PlusIcon,
  radius,
  StarIcon,
  tokens,
  usePrefersReducedMotion,
  visuallyHidden,
} from '@pocket-pantry/ui';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HEALTH_TODO_KEYS,
  isForgotten,
  usualExpiryDate,
  type HealthTodo,
  type HealthTodoGroup,
  type HealthTodoKey,
} from '../../lib/health';
import { localIso, useExpiryTags } from '../../lib/pantry';
import type { PantryHealthState } from '../../lib/usePantryHealth';
import { ExpiryTag } from '../ExpiryTag';
import { IngredientIconSlot } from '../IngredientIconSlot';
import { expiringSoonDay, todoTitle } from './todoText';
import { todoItems, type TodoItem } from './todoItems';
import { SetDateSheet } from './SetDateSheet';
import { useAddToShoppingList, type ShoppingFix } from './useAddToShoppingList';
import { useDateBatches, type DateFix } from './useDateBatches';

const GROUPS: HealthTodoGroup[] = ['now', 'week', 'tidy'];

/** Severity icon and colour pair of each Health To-do; colour is never the only signal. */
const SEVERITY: Record<
  HealthTodoKey,
  { icon: ReactNode; background: string; color: string }
> = {
  expired: {
    icon: <DeleteIcon size={16} strokeWidth={2.2} />,
    background: tokens.color.urgentBg,
    color: tokens.color.urgentFg,
  },
  missingStaples: {
    icon: <StarIcon size={16} strokeWidth={2.2} />,
    background: tokens.color.urgentBg,
    color: tokens.color.urgentFg,
  },
  expiringSoon: {
    icon: <CookIcon size={16} strokeWidth={2.2} />,
    background: tokens.color.soonBg,
    color: tokens.color.soonFg,
  },
  runningLow: {
    icon: <BatteryLowIcon size={16} strokeWidth={2.2} />,
    background: tokens.color.butter,
    color: tokens.color.butterInk,
  },
  undated: {
    icon: <CalendarIcon size={16} strokeWidth={2.2} />,
    background: tokens.color.chipNeutral,
    color: tokens.color.ink,
  },
};

const OPEN_MS = 300;
const EASING = 'cubic-bezier(.2,.8,.2,1)';
const NAMES_SHOWN = 3;

type Props = {
  state: PantryHealthState;
  today: Date;
};

/** The Health To-dos grouped Now / This week / Tidy up, then a pill for each one with nothing to do. */
export function HealthTodos({ state, today }: Props) {
  const { t, i18n } = useTranslation('dashboard');
  const { tagFor } = useExpiryTags(today);
  const [openKey, setOpenKey] = useState<HealthTodoKey | null>(null);
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
  // A Health To-do that is gone must not reopen when it comes back.
  if (openKey !== null && !todos.some((todo) => todo.key === openKey))
    setOpenKey(null);

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
            color: tokens.color.muted,
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
              bgcolor: tokens.color.accentTint,
              color: tokens.color.accentOnTint,
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
                color: tokens.color.muted,
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
                  open={openKey === todo.key}
                  onToggle={() =>
                    setOpenKey(openKey === todo.key ? null : todo.key)
                  }
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
                bgcolor: tokens.color.okBg,
                color: tokens.color.okFg,
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

type RowProps = {
  todo: HealthTodo;
  title: string;
  items: TodoItem[];
  open: boolean;
  onToggle: () => void;
  tagFor: ReturnType<typeof useExpiryTags>['tagFor'];
  onToss: PantryHealthState['tossBatches'];
  onUsed: PantryHealthState['markUsed'];
  shopping: ShoppingFix;
  dating: DateFix;
  /** Whether any Batch of an undated Health To-do has a Default Expiry to give. */
  canDateAll: boolean;
  onSetDate: (batchId: string) => void;
};

/** What a Member can do to one item of a Health To-do on its own row. */
function itemAction(todo: Pick<HealthTodo, 'key'>, item: TodoItem) {
  if (todo.key === 'expired' || (todo.key === 'undated' && item.forgotten))
    return 'toss';
  if (todo.key === 'expiringSoon') return 'used';
  return null;
}

function TodoRow({
  todo,
  title,
  items,
  open,
  onToggle,
  tagFor,
  onToss,
  onUsed,
  shopping,
  dating,
  canDateAll,
  onSetDate,
}: RowProps) {
  const { t } = useTranslation('dashboard');
  const reduceMotion = usePrefersReducedMotion();
  const itemsId = useId();
  const count = todo.itemIds.length;
  const severity = SEVERITY[todo.key];
  const names = items
    .slice(0, NAMES_SHOWN)
    .map((item) => item.name)
    .join(', ');
  const subline =
    items.length > NAMES_SHOWN
      ? t('health.moreNames', { names, count: items.length - NAMES_SHOWN })
      : names;
  const bulkName = t(`health.todo.${todo.key}.bulkName`, { count });
  const addsToList = todo.key === 'missingStaples' || todo.key === 'runningLow';
  const bulkProps =
    todo.key === 'expiringSoon'
      ? { href: '/recipes' }
      : todo.key === 'expired'
        ? {
            onClick: () =>
              onToss(todo.itemIds, t('health.toast.expired', { count })),
          }
        : addsToList
          ? {
              disabled: shopping.isPending,
              onClick: () => void shopping.add(todo.key, todo.itemIds),
            }
          : todo.key === 'undated'
            ? {
                disabled: !canDateAll || dating.isPending,
                onClick: () => void dating.dateAll(todo.itemIds),
              }
            : { disabled: true };

  return (
    <Box
      component="li"
      data-testid="todo-card"
      sx={{
        mt: '8px',
        p: '10px 10px 10px 12px',
        borderRadius: radius.card,
        bgcolor: color.cardBg,
        border: `1px solid ${color.cardLine}`,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <Box
          component="button"
          type="button"
          aria-expanded={open}
          aria-controls={itemsId}
          onClick={onToggle}
          sx={{
            all: 'unset',
            boxSizing: 'border-box',
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer',
            '&:focus-visible': {
              outline: `2px solid ${tokens.color.accent}`,
              outlineOffset: 2,
            },
          }}
        >
          <Box
            component="span"
            aria-hidden="true"
            sx={{
              flexShrink: 0,
              width: 38,
              height: 38,
              borderRadius: radius.control,
              display: 'grid',
              placeItems: 'center',
              bgcolor: severity.background,
              color: severity.color,
            }}
          >
            {severity.icon}
          </Box>
          <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
            <Box
              component="span"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: 15.5,
                fontWeight: 700,
              }}
            >
              {title}
              {todo.gain > 0 ? (
                <Box
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: 18,
                    p: '0 6px',
                    borderRadius: radius.tag,
                    fontSize: 11,
                    fontWeight: 800,
                    bgcolor: tokens.color.okBg,
                    color: tokens.color.okFg,
                  }}
                >
                  <span aria-hidden="true">+{todo.gain}</span>
                  <Box component="span" sx={visuallyHidden}>
                    {t('health.gainSpoken', { count: todo.gain })}
                  </Box>
                </Box>
              ) : null}
              <Box
                component="span"
                aria-hidden="true"
                sx={{
                  display: 'flex',
                  color: tokens.color.muted,
                  transform: open ? 'rotate(180deg)' : 'none',
                  transition: reduceMotion
                    ? 'none'
                    : `transform ${OPEN_MS}ms ${EASING}`,
                }}
              >
                <ChevronDownIcon size={18} />
              </Box>
            </Box>
            <Box
              component="span"
              sx={{
                display: 'block',
                fontSize: 13,
                color: tokens.color.muted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {subline}
            </Box>
          </Box>
        </Box>
        <Button
          variant={todo.group === 'now' ? 'primary' : 'secondary'}
          size="sm"
          shape="pill"
          aria-label={bulkName}
          sx={{
            flexShrink: 0,
            minHeight: 32,
            height: 32,
            fontSize: 12.5,
            fontWeight: 700,
          }}
          {...bulkProps}
        >
          {t(`health.todo.${todo.key}.bulk`)}
        </Button>
      </Box>
      {/* Always mounted: toggling only moves the row height, so the transition survives. */}
      <Box
        id={itemsId}
        sx={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: reduceMotion
            ? 'none'
            : `grid-template-rows ${OPEN_MS}ms ${EASING}`,
        }}
      >
        <Box
          sx={{
            overflow: 'hidden',
            visibility: open ? 'visible' : 'hidden',
            transition: reduceMotion
              ? 'none'
              : `visibility 0s linear ${open ? 0 : OPEN_MS}ms`,
          }}
        >
          <Box
            component="ul"
            sx={{
              listStyle: 'none',
              m: 0,
              p: '0 0 10px',
              display: 'grid',
              // minmax(0, …) stops a long item line widening the column past the sheet.
              gridTemplateColumns: 'minmax(0, 1fr)',
              gap: '2px',
            }}
          >
            {items.map((item) => (
              <TodoItemRow
                key={item.id}
                item={item}
                tagFor={tagFor}
                action={itemAction(todo, item)}
                onToss={(message) => onToss([item.id], message)}
                onUsed={(message) => onUsed([item.id], message)}
                onAdd={
                  addsToList
                    ? () => void shopping.add(todo.key, [item.id])
                    : undefined
                }
                addDisabled={shopping.isPending}
                onSetDate={
                  todo.key === 'undated' ? () => onSetDate(item.id) : undefined
                }
              />
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function TodoItemRow({
  item,
  tagFor,
  action,
  onToss,
  onUsed,
  onAdd,
  addDisabled,
  onSetDate,
}: {
  item: TodoItem;
  tagFor: RowProps['tagFor'];
  action: ReturnType<typeof itemAction>;
  onToss: (message: string) => void;
  onUsed: (message: string) => void;
  /** Set where the item's action is adding it to the Shopping List. */
  onAdd?: () => void;
  addDisabled: boolean;
  /** Set where the item's action is dating the Batch by hand. */
  onSetDate?: () => void;
}) {
  const { t } = useTranslation('dashboard');
  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minHeight: 42,
        p: '4px 8px 4px 6px',
        borderRadius: radius.control,
        bgcolor: tokens.color.subtle,
      }}
    >
      <IngredientIconSlot
        ingredientId={item.ingredientId}
        aisleId={item.aisleId}
      />
      <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
        <Box
          component="span"
          sx={{
            display: 'block',
            fontSize: 13.5,
            fontWeight: 600,
            overflowWrap: 'anywhere',
          }}
        >
          {item.name}
        </Box>
        <Box
          component="span"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: 12,
            color: tokens.color.muted,
          }}
        >
          {item.forgotten ? (
            <Box component="span" aria-hidden="true" sx={{ display: 'flex' }}>
              <HourglassIcon size={12} />
            </Box>
          ) : null}
          <Box
            component="span"
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.line}
          </Box>
        </Box>
      </Box>
      {item.expiryDate !== null ? (
        <ExpiryTag tag={tagFor(item.expiryDate)} />
      ) : null}
      {action === 'toss' ? (
        <IconButton
          label={t('health.item.toss', { name: item.name })}
          tone="plain"
          size={34}
          onClick={() => onToss(t('health.toast.tossed', { name: item.name }))}
        >
          <DeleteIcon size={16} />
        </IconButton>
      ) : null}
      {onSetDate ? (
        <Button
          variant="secondary"
          size="sm"
          shape="pill"
          aria-label={t('health.item.setDateName', { name: item.name })}
          onClick={onSetDate}
          sx={{ flexShrink: 0, minHeight: 30, height: 30, fontSize: 12.5 }}
        >
          {t('health.item.setDate')}
        </Button>
      ) : null}
      {action === 'used' ? (
        <Button
          variant="secondary"
          size="sm"
          shape="pill"
          aria-label={t('health.item.usedName', { name: item.name })}
          sx={{ flexShrink: 0, minHeight: 30, height: 30, fontSize: 12.5 }}
          onClick={() => onUsed(t('health.toast.used', { name: item.name }))}
        >
          {t('health.item.used')}
        </Button>
      ) : null}
      {onAdd ? (
        <IconButton
          label={t('health.item.add', { name: item.name })}
          tone="accentOutline"
          size={34}
          disabled={addDisabled}
          onClick={onAdd}
        >
          <PlusIcon size={16} />
        </IconButton>
      ) : null}
    </Box>
  );
}

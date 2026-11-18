import {
  Box,
  Button,
  ChevronDownIcon,
  color,
  palette,
  radius,
  usePrefersReducedMotion,
  visuallyHidden,
} from '@pocket-pantry/ui';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HealthTodo } from '@/lib/health';
import type { useExpiryTags } from '@/lib/pantry';
import type { PantryHealthState } from '@/lib/usePantryHealth';
import { SEVERITY } from '../severity';
import type { TodoItem } from '../todoItems';
import { TodoItemRow, type ItemAction } from '../TodoItemRow/TodoItemRow';
import type { ShoppingFix } from '../useAddToShoppingList';
import type { DateFix } from '../useDateBatches';

const OPEN_MS = 300;
const EASING = 'cubic-bezier(.2,.8,.2,1)';
const NAMES_SHOWN = 3;

type RowProps = {
  todo: HealthTodo;
  title: string;
  items: TodoItem[];
  /** The mounted row that is open; a row is open when this is its own mark. */
  openRow: symbol | null;
  onOpenChange: (row: symbol | null) => void;
  tagFor: ReturnType<typeof useExpiryTags>['tagFor'];
  onToss: PantryHealthState['tossBatches'];
  onUsed: PantryHealthState['markUsed'];
  shopping: ShoppingFix;
  dating: DateFix;
  /** Whether any Batch of an undated Health To-do has a Default Expiry to give. */
  canDateAll: boolean;
  onSetDate: (batchId: string) => void;
};

/** Which item action a Health To-do's row offers for this item. */
function itemAction(todo: Pick<HealthTodo, 'key'>, item: TodoItem): ItemAction {
  if (todo.key === 'expired' || (todo.key === 'undated' && item.forgotten))
    return 'toss';
  if (todo.key === 'expiringSoon') return 'used';
  return null;
}

export function TodoRow({
  todo,
  title,
  items,
  openRow,
  onOpenChange,
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
  // A To-do that vanishes unmounts its row, so when it returns it is a new mark and starts closed.
  const [self] = useState(() => Symbol(todo.key));
  const open = openRow === self;
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
          onClick={() => onOpenChange(open ? null : self)}
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
              outline: `2px solid ${palette('pp-accent')}`,
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
                    bgcolor: palette('success-light'),
                    color: palette('success-main'),
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
                  color: palette('text-secondary'),
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
                color: palette('text-secondary'),
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

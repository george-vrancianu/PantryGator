import {
  Box,
  Button,
  DeleteIcon,
  HourglassIcon,
  IconButton,
  palette,
  PlusIcon,
  radius,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import type { useExpiryTags } from '@/lib/pantry';
import { ExpiryTag } from '@/components/pantry/ExpiryTag/ExpiryTag';
import { IngredientIconSlot } from '@/components/catalog/IngredientIconSlot/IngredientIconSlot';
import type { TodoItem } from '../todoItems';

/** What a Member can do to one item of a Health To-do on its own row. */
export type ItemAction = 'toss' | 'used' | null;

export function TodoItemRow({
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
  tagFor: ReturnType<typeof useExpiryTags>['tagFor'];
  action: ItemAction;
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
        bgcolor: palette('pp-subtle'),
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
            color: palette('text-secondary'),
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

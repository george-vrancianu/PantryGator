import {
  Box,
  CheckIcon,
  ListRow,
  Stack,
  SwipeRow,
  type SwipeRowHandle,
  Typography,
  useToast,
  Card,
  color,
  radius,
  palette,
} from '@pocket-pantry/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AmountSheet } from '../AmountSheet/AmountSheet';
import { RowFlash, flashHost } from '@/components/lists/RowFlash/RowFlash';
import { IngredientIconSlot } from '@/components/catalog/IngredientIconSlot/IngredientIconSlot';
import { formatRowAmount, type Amount } from '@/lib/amount';
import type { RowHint } from '@/lib/useRowHint';
import { useSwipeRowLabels } from '@/lib/useSwipeRowLabels';
import { StapleToggle } from '../StapleToggle/StapleToggle';
import type { ShoppingGroup, ShoppingItem } from '@/lib/shopping';

/** Greyed text colour of a checked row, shared by its name and icon. */
const CHECKED_TEXT = palette('text-secondary');

export type ShoppingGroupsProps = {
  groups: ShoppingGroup[];
  onToggle: (id: string, checked: boolean) => void;
  onSetAmount: (id: string, amount: Amount) => Promise<unknown>;
  onRemove: (id: string, name: string) => void;
  /** The first-use hint: the first row peeks, and a gesture on any row fades the pill. */
  hint: Pick<RowHint, 'peek' | 'onLearned'>;
};

/** The list grouped by Aisle (shop order is the order the API returns). */
export function ShoppingGroups({
  groups,
  onToggle,
  onSetAmount,
  onRemove,
  hint,
}: ShoppingGroupsProps) {
  const { t } = useTranslation('shopping');
  return (
    <Stack spacing={2} data-row-scope="">
      {groups.map((group, groupIndex) => {
        const title = group.aisle?.name ?? t('unmatchedGroup');
        return (
          <Box
            component="section"
            key={group.aisle?.id ?? 'unmatched'}
            aria-label={title}
          >
            <Typography
              component="h2"
              variant="sectionLabel"
              color="text.secondary"
              sx={{ display: 'block', mx: 0.5, mb: 1 }}
            >
              {`${title} · ${group.items.length}`}
            </Typography>
            <Card
              component="ul"
              variant="list"
              sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }}
            >
              {group.items.map((item, itemIndex) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  peek={groupIndex === 0 && itemIndex === 0 && hint.peek}
                  onLearned={hint.onLearned}
                  aisleId={group.aisle?.id}
                  onToggle={onToggle}
                  onSetAmount={onSetAmount}
                  onRemove={onRemove}
                />
              ))}
            </Card>
          </Box>
        );
      })}
    </Stack>
  );
}

function ChecklistRow({
  item,
  peek,
  onLearned,
  aisleId,
  onToggle,
  onSetAmount,
  onRemove,
}: {
  item: ShoppingItem;
  peek: boolean;
  onLearned: () => void;
  /** The group's Aisle; absent in the Unmatched group. */
  aisleId?: string;
  onToggle: ShoppingGroupsProps['onToggle'];
  onSetAmount: ShoppingGroupsProps['onSetAmount'];
  onRemove: ShoppingGroupsProps['onRemove'];
}) {
  const { t, i18n } = useTranslation('shopping');
  const toast = useToast();
  const labels = useSwipeRowLabels(item.name, 'shopping', { hold: true });
  const [editing, setEditing] = useState(false);
  const row = useRef<SwipeRowHandle>(null);

  const quantity = formatRowAmount(item, i18n.language, t);

  return (
    <>
      <SwipeRow
        ref={row}
        name={item.name}
        labels={labels}
        disabled={editing}
        peek={peek}
        onLearned={onLearned}
        pressed={item.checked}
        onEdit={() => setEditing(true)}
        onTap={() => onToggle(item.id, !item.checked)}
        onRemove={() => onRemove(item.id, item.name)}
      >
        <Box sx={flashHost}>
          <ListRow
            done={item.checked}
            title={item.name}
            meta={quantity}
            leading={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  aria-hidden="true"
                  sx={{
                    flexShrink: 0,
                    width: 24,
                    height: 24,
                    boxSizing: 'border-box',
                    borderRadius: radius.box,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    ...(item.checked
                      ? {
                          bgcolor: palette('pp-accent'),
                          color: color.accentInk,
                        }
                      : { border: `2px solid ${palette('pp-box')}` }),
                  }}
                >
                  {item.checked ? (
                    <CheckIcon size={16} strokeWidth={2.6} />
                  ) : null}
                </Box>
                <IngredientIconSlot
                  ingredientId={item.ingredientId}
                  aisleId={aisleId}
                  color={item.checked ? CHECKED_TEXT : 'text.primary'}
                />
              </Box>
            }
            tags={
              item.unmatched ? (
                <Typography
                  component="span"
                  sx={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: color.accentOnTint,
                    bgcolor: palette('pp-accentTint'),
                    px: 1,
                    py: 0.5,
                    borderRadius: radius.box,
                  }}
                >
                  {t('item.unmatched')}
                </Typography>
              ) : null
            }
            trailing={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {item.ingredientId !== null ? (
                  <StapleToggle
                    ingredientId={item.ingredientId}
                    name={item.name}
                    onToggled={(isStaple) =>
                      toast.show(
                        t(
                          isStaple
                            ? 'item.nowStaple'
                            : 'item.removedFromStaples',
                          {
                            name: item.name,
                          },
                        ),
                      )
                    }
                  />
                ) : null}
              </Box>
            }
          />
          <RowFlash ids={[item.id]} />
        </Box>
      </SwipeRow>
      <AmountSheet
        open={editing}
        name={item.name}
        context={t('common:row.context.shopping')}
        amount={{ quantity: item.quantity, unit: item.unit }}
        onSave={async (amount) => {
          await onSetAmount(item.id, amount);
          setEditing(false);
          toast.show(t('common:row.updated', { name: item.name }));
        }}
        onClose={() => setEditing(false)}
        removeLabel={t('common:edit.removeFromList')}
        onRemove={() => row.current?.askToRemove()}
      />
    </>
  );
}

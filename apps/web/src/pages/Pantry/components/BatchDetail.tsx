import {
  Box,
  Sheet,
  SwipeRow,
  Typography,
  tokens,
  useToast,
  type SwipeRowHandle,
} from '@pocket-pantry/ui';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExpiryTag } from '../../../components/ExpiryTag';
import { fullDate, useExpiryTags, type Batch } from '../../../lib/pantry';
import { formatAmount } from '../../../lib/amount';
import { batchRowSx } from './ingredientBlock';
import { useSwipeRowLabels } from '../../../lib/useSwipeRowLabels';
import { EditBatchForm, type EditSubmitState } from './EditBatchForm';

type Props = {
  batch: Batch;
  /** Its place in the open Ingredient, from 0: shown as 1, 2, 3, and it staggers the rows in. */
  index: number;
  today: Date;
  /** Swiped or confirmed away: the page hides the Batch and deletes it when its Undo ends. */
  onRemove: (batch: Batch) => void;
  /** Called once the Batch moved to another Location, so the parent can place focus (this row unmounts). */
  onLeft: () => void;
  /** The first-use peek, for the first Batch of the first expanded roll-up. */
  peek: boolean;
  onLearned: () => void;
};

const ellipsis = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

/**
 * One Batch inside an open Ingredient: its number, amount · full expiry date (or "no date"), Product Description
 * and ExpiryTag. Swipe left to remove it; hold (or press Enter) to edit it in a sheet, which also offers "Remove
 * from Pantry".
 */
export function BatchDetail({
  batch,
  index,
  today,
  onRemove,
  onLeft,
  peek,
  onLearned,
}: Props) {
  const { t, i18n } = useTranslation('pantry');
  const toast = useToast();
  const tag = useExpiryTags(today).tagFor(batch.expiryDate);
  const [editing, setEditing] = useState(false);
  const row = useRef<SwipeRowHandle>(null);
  const formId = useId();
  // The Sheet's Save: the form reports its label and whether it can save.
  const [submit, setSubmit] = useState<EditSubmitState>({
    label: t('edit.save'),
    disabled: true,
  });
  // "Remove from Pantry" closes the sheet and asks once it has finished closing (focus is back on the row).
  const removeRequested = useRef(false);

  const amount =
    batch.quantity === null || batch.unit === null
      ? null
      : formatAmount(batch.quantity, batch.unit, i18n.language, t);
  const expires =
    batch.expiryDate === null
      ? t('batch.noDate')
      : fullDate(batch.expiryDate, today, i18n.language);
  // "500 g Greek yogurt": names this Batch, not just its Ingredient, e.g. in "Remove 500 g Greek yogurt?".
  const name = amount ? `${amount} ${batch.name}` : batch.name;
  const labels = useSwipeRowLabels(name, 'pantry', { hold: true });

  return (
    <>
      <SwipeRow
        ref={row}
        name={name}
        labels={labels}
        disabled={editing}
        peek={peek}
        onLearned={onLearned}
        onEdit={() => setEditing(true)}
        onRemove={() => onRemove(batch)}
      >
        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            minHeight: 50,
            // With the row's own 12 / 10 pt: 7 12 7 62, under the Ingredient's name.
            py: '7px',
            pl: '50px',
            pr: '2px',
            ...batchRowSx(index),
          }}
        >
          <Box
            component="span"
            aria-hidden="true"
            sx={{
              position: 'absolute',
              // Centred under the Ingredient's 38 pt icon.
              left: '9px',
              top: '50%',
              mt: '-11px',
              width: 22,
              height: 22,
              borderRadius: '50%',
              bgcolor: tokens.color.chipNeutral,
              display: 'grid',
              placeItems: 'center',
              fontSize: 11,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {index + 1}
          </Box>
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '1px',
            }}
          >
            <Typography
              component="span"
              sx={{
                fontSize: 14,
                fontVariantNumeric: 'tabular-nums',
                ...ellipsis,
              }}
            >
              {amount ? (
                <Box component="b" sx={{ fontWeight: 700 }}>
                  {amount}
                </Box>
              ) : null}
              <Box component="span" sx={{ color: tokens.color.muted }}>
                {amount ? ` · ${expires}` : expires}
              </Box>
            </Typography>
            {batch.productDescription ? (
              <Typography
                component="span"
                sx={{ fontSize: 12.5, color: tokens.color.muted, ...ellipsis }}
              >
                {batch.productDescription}
              </Typography>
            ) : null}
          </Box>
          <ExpiryTag tag={tag} />
        </Box>
      </SwipeRow>
      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        onExited={() => {
          if (!removeRequested.current) return;
          removeRequested.current = false;
          row.current?.askToRemove();
        }}
        title={batch.name}
        subtitle={t('common:row.context.pantry')}
        primary={{
          label: submit.label,
          disabled: submit.disabled,
          form: formId,
        }}
        destructive={{
          label: t('common:edit.removeFromPantry'),
          onClick: () => {
            removeRequested.current = true;
            setEditing(false);
          },
        }}
      >
        <EditBatchForm
          batch={batch}
          onSaved={(edit) => {
            setEditing(false);
            toast.show(t('common:row.updated', { name: batch.name }));
            // A `location` in the edit means the Batch moved out of this row.
            if (edit.location) onLeft();
          }}
          formId={formId}
          onSubmitChange={setSubmit}
        />
      </Sheet>
    </>
  );
}

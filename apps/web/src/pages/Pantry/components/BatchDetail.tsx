import {
  Box,
  Sheet,
  SwipeRow,
  Typography,
  tokens,
  useToast,
  type SwipeRowHandle,
} from '@pocket-pantry/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExpiryTag } from '../../../components/ExpiryTag';
import { fullDate, useExpiryTags, type Batch } from '../../../lib/pantry';
import { formatAmount } from '../../../lib/amount';
import { keyframesSx } from '../../../lib/keyframesSx';
import { useSwipeRowLabels } from '../../../lib/useSwipeRowLabels';
import { EditBatchForm } from './EditBatchForm';
import { flatBatchSx, useOpenVariant } from './openEffect.prototype';

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
  const variant = useOpenVariant(); // PROTOTYPE
  const tag = useExpiryTags(today).tagFor(batch.expiryDate);
  const [editing, setEditing] = useState(false);
  const row = useRef<SwipeRowHandle>(null);
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
            ...(variant === 'lift'
              ? keyframesSx(
                  'pp-batch-in',
                  `220ms ease-out ${index * 35 + 60}ms both`,
                  {
                    from: { opacity: 0, transform: 'translateY(-4px)' },
                    to: { opacity: 1, transform: 'none' },
                  },
                )
              : flatBatchSx(variant, index)),
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
        label={t('edit.title', { name: batch.name })}
        header={
          <Box sx={{ px: 3, pt: 2, pb: 1 }}>
            <Typography
              component="h2"
              sx={{ fontSize: 20, fontWeight: 700, overflowWrap: 'anywhere' }}
            >
              {batch.name}
            </Typography>
            <Typography variant="meta" color="text.secondary">
              {t('common:row.context.pantry')}
            </Typography>
          </Box>
        }
      >
        <EditBatchForm
          batch={batch}
          onSaved={(edit) => {
            setEditing(false);
            toast.show(t('common:row.updated', { name: batch.name }));
            // A `location` in the edit means the Batch moved out of this row.
            if (edit.location) onLeft();
          }}
          onCancel={() => setEditing(false)}
          onRemove={() => {
            removeRequested.current = true;
            setEditing(false);
          }}
        />
      </Sheet>
    </>
  );
}

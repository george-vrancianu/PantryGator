import {
  Alert,
  Box,
  Button,
  Sheet,
  Stack,
  Typography,
} from '@pocket-pantry/ui';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '../i18n/translateApiError';
import type { Unit } from '../lib/catalog';
import type { Amount } from '../lib/amount';
import { parseAmountText } from '../lib/pantry';
import { AmountField } from './AmountField';
import { RemoveLink } from './RemoveLink';

export type { Amount };

export type AmountSheetProps = {
  open: boolean;
  /** The sheet's title, and the name in the field's accessible label. */
  name: string;
  /** The line under the title, e.g. "from your list". */
  context: string;
  /** The amount shown when the sheet opens; the fields restart from it each time it opens. */
  amount: Amount;
  /**
   * Save the amount. Resolve when it is saved (the caller closes the sheet and shows "Updated {name}");
   * reject, ideally with an `ApiError`, to keep the sheet open with the reason shown.
   */
  onSave: (amount: Amount) => Promise<unknown>;
  /** A quantity needs a unit (Staples); no quantity at all is still fine. Shows `amount.unitRequired`. */
  requireUnit?: boolean;
  /** Cancel, Escape and the scrim. */
  onClose: () => void;
  /** Text of the red link under the buttons, e.g. `t('common:edit.removeFromList')`. */
  removeLabel: string;
  /**
   * The link was pressed. The sheet closes itself (through `onClose`) and calls this once it has
   * finished closing, so the caller can call `SwipeRowHandle.askToRemove()` with focus back on the row.
   */
  onRemove: () => void;
};

/**
 * The sheet that changes an item's amount: its name, a context line, the amount field with a unit chip,
 * Cancel and Save, and a "Remove from ..." link. It knows nothing about what the item is, so Shopping
 * Items, Template Lines and Staples share it.
 */
export function AmountSheet({
  open,
  name,
  context,
  amount,
  requireUnit = false,
  onSave,
  onClose,
  removeLabel,
  onRemove,
}: AmountSheetProps) {
  const { t } = useTranslation('common');
  const removeRequested = useRef(false);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      onExited={() => {
        if (!removeRequested.current) return;
        removeRequested.current = false;
        onRemove();
      }}
      label={t('edit.title', { name })}
      size="content"
      header={
        <Box sx={{ px: 3, pt: 2, pb: 1 }}>
          <Typography
            component="h2"
            sx={{ fontSize: 20, fontWeight: 700, overflowWrap: 'anywhere' }}
          >
            {name}
          </Typography>
          <Typography variant="meta" color="text.secondary">
            {context}
          </Typography>
        </Box>
      }
    >
      <AmountForm
        name={name}
        amount={amount}
        requireUnit={requireUnit}
        onSave={onSave}
        onCancel={onClose}
        removeLabel={removeLabel}
        onRemove={() => {
          removeRequested.current = true;
          onClose();
        }}
      />
    </Sheet>
  );
}

/** Mounted with the open sheet, so its fields start from the item's amount every time. */
function AmountForm({
  name,
  amount,
  requireUnit,
  onSave,
  onCancel,
  removeLabel,
  onRemove,
}: Pick<
  AmountSheetProps,
  'name' | 'amount' | 'onSave' | 'removeLabel' | 'requireUnit'
> & {
  onCancel: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation('common');
  const [quantity, setQuantity] = useState(
    amount.quantity === null ? '' : String(amount.quantity),
  );
  const [unit, setUnit] = useState<Unit | ''>(amount.unit ?? '');
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const sending = useRef(false);

  const parsed = parseAmountText(quantity);

  const needsUnit =
    requireUnit && parsed.valid && parsed.value !== null && unit === '';

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    // Enter and the button can both fire; one save at a time.
    if (sending.current) return;
    setAttempted(true);
    if (!parsed.valid || needsUnit) return;
    sending.current = true;
    setSaving(true);
    setFailure(null);
    onSave({ quantity: parsed.value, unit: unit || null }).then(
      () => {
        // The caller closes the sheet, which unmounts this form.
      },
      (error: unknown) => {
        sending.current = false;
        setSaving(false);
        setFailure(translateApiError(t, error));
      },
    );
  };

  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={submit}
      aria-label={t('edit.title', { name })}
      sx={{ px: 3, pt: 1, pb: 3 }}
    >
      <AmountField
        name={name}
        quantity={quantity}
        unit={unit}
        onQuantityChange={(next, typedUnit) => {
          setQuantity(next);
          if (typedUnit !== undefined) setUnit(typedUnit);
        }}
        onUnitChange={setUnit}
        error={
          attempted && !parsed.valid
            ? t('amount.invalid')
            : attempted && needsUnit
              ? t('amount.unitRequired')
              : null
        }
        onSubmit={submit}
      />
      {failure ? <Alert>{failure}</Alert> : null}
      <Stack direction="row" spacing={1}>
        <Button type="submit" disabled={saving}>
          {saving ? t('edit.saving') : t('edit.save')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          sx={{ height: 52 }}
          onClick={onCancel}
        >
          {t('cancel')}
        </Button>
      </Stack>
      <RemoveLink onClick={onRemove}>{removeLabel}</RemoveLink>
    </Stack>
  );
}

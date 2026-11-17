import { Alert, Sheet, Stack } from '@pocket-pantry/ui';
import { useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '../i18n/translateApiError';
import type { Unit } from '../lib/catalog';
import type { Amount } from '../lib/amount';
import { parseAmountText } from '../lib/pantry';
import { AmountField } from './AmountField';

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
  /** The X, Escape and the scrim. */
  onClose: () => void;
  /** Text of the red link under the amount field, e.g. `t('common:edit.removeFromList')`. */
  removeLabel: string;
  /**
   * The link was pressed. The sheet closes itself (through `onClose`) and calls this once it has
   * finished closing, so the caller can call `SwipeRowHandle.askToRemove()` with focus back on the row.
   */
  onRemove: () => void;
};

/**
 * The sheet that changes an item's amount: its name as the title with a context line, the amount field
 * with a unit chip, a pinned Save, and a "Remove from ..." link. It knows nothing about what the item is,
 * so Shopping Items, Template Lines and Staples share it.
 */
export function AmountSheet(props: AmountSheetProps) {
  // The body remounts on each opening so the fields start from the item's amount every time.
  const [opening, setOpening] = useState(0);
  const [wasOpen, setWasOpen] = useState(props.open);
  if (props.open !== wasOpen) {
    setWasOpen(props.open);
    if (props.open) setOpening((n) => n + 1);
  }
  return <AmountSheetBody key={opening} {...props} />;
}

function AmountSheetBody({
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
  const formId = useId();
  const removeRequested = useRef(false);
  const sending = useRef(false);
  const [quantity, setQuantity] = useState(
    amount.quantity === null ? '' : String(amount.quantity),
  );
  const [unit, setUnit] = useState<Unit | ''>(amount.unit ?? '');
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

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
        // The caller closes the sheet.
      },
      (error: unknown) => {
        sending.current = false;
        setSaving(false);
        setFailure(translateApiError(t, error));
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      onExited={() => {
        if (!removeRequested.current) return;
        removeRequested.current = false;
        onRemove();
      }}
      title={name}
      subtitle={context}
      size="content"
      primary={{
        label: saving ? t('edit.saving') : t('edit.save'),
        pending: saving,
        form: formId,
      }}
      destructive={{
        label: removeLabel,
        onClick: () => {
          removeRequested.current = true;
          onClose();
        },
      }}
    >
      <Stack
        component="form"
        id={formId}
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
      </Stack>
    </Sheet>
  );
}

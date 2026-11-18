import { Alert, Stack, TextField } from '@pocket-pantry/ui';
import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { expiryContext } from '@/components/expiryPicker/expiryContext';
import { ExpiryField } from '@/components/expiryPicker/ExpiryField/ExpiryField';
import { LocationToggle } from '@/components/pantry/LocationToggle/LocationToggle';
import type { Batch, BatchEdit } from '@/lib/pantry';
import { useEditBatchForm } from '../../hooks/useEditBatchForm';
import { BatchAmountField } from '../BatchAmountField/BatchAmountField';

type Props = {
  batch: Batch;
  onSaved: (edit: BatchEdit) => void;
  /** The form's id: the host Sheet's primary points at it with `form=`. */
  formId: string;
  /** Told what the host's Save shows and whether it can be pressed. */
  onSubmitChange: (submit: EditSubmitState) => void;
};

/** What the Sheet's Save button says, and whether it can be pressed. */
export type EditSubmitState = {
  label: string;
  disabled: boolean;
  pending: boolean;
};

export function EditBatchForm({
  batch,
  onSaved,
  formId,
  onSubmitChange,
}: Props) {
  const { t, i18n } = useTranslation('pantry');
  const form = useEditBatchForm(batch, { onSaved });
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const label = form.saving ? t('form.saving') : t('edit.save');
  const disabled = !form.canSave;
  const pending = form.saving;
  useEffect(() => {
    onSubmitChange({ label, disabled, pending });
  }, [label, disabled, pending, onSubmitChange]);

  return (
    <Stack
      component="form"
      id={formId}
      ref={formRef}
      spacing={2}
      onSubmit={form.submit}
      aria-label={t('edit.title', { name: batch.name })}
      sx={{ px: 3, pt: 1, pb: 3 }}
    >
      <BatchAmountField
        name={batch.name}
        amountScale={batch.amountScale}
        quantity={form.quantity}
        unit={form.unit}
        quantityValid={form.quantityValid}
        onQuantityChange={form.setQuantity}
        onUnitChange={form.setUnit}
        onSubmit={() => formRef.current?.requestSubmit()}
      />
      <LocationToggle
        label={t('form.location')}
        value={form.location}
        onChange={form.setLocation}
      />
      <ExpiryField
        id={`${id}-expiry`}
        label={t('picker.label')}
        value={form.expiryDate}
        onChange={form.setExpiryDate}
        usualDays={batch.defaultExpiryDays}
        context={expiryContext(
          {
            name: batch.name,
            quantity: form.quantity,
            unit: form.unit,
            location: form.location,
          },
          i18n.language,
          t,
        )}
      />
      <TextField
        id={`${id}-description`}
        label={t('form.description')}
        placeholder={t('form.descriptionPlaceholder')}
        value={form.description}
        onChange={(event) => form.setDescription(event.target.value)}
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />
      {form.error ? <Alert>{form.error}</Alert> : null}
    </Stack>
  );
}

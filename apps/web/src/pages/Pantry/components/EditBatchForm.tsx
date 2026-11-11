import { Alert, Button, Stack, TextField } from '@pocket-pantry/ui';
import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ExpiryField, expiryContext } from '../../../components/ExpiryPicker';
import { LocationToggle } from '../../../components/LocationToggle';
import { RemoveLink } from '../../../components/RemoveLink';
import type { Batch, BatchEdit } from '../../../lib/pantry';
import { useEditBatchForm } from '../hooks/useEditBatchForm';
import { BatchAmountField } from './BatchAmountField';

type Props = {
  batch: Batch;
  onSaved: (edit: BatchEdit) => void;
  onCancel: () => void;
  /** The "Remove from Pantry" link under the buttons. */
  onRemove: () => void;
};

export function EditBatchForm({ batch, onSaved, onCancel, onRemove }: Props) {
  const { t, i18n } = useTranslation('pantry');
  const form = useEditBatchForm(batch, { onSaved });
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Stack
      component="form"
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
      {/* No Usual tile: the Default Expiry counts from the purchase date, which a Batch doesn't carry. */}
      <ExpiryField
        id={`${id}-expiry`}
        label={t('picker.label')}
        value={form.expiryDate}
        onChange={form.setExpiryDate}
        usualDays={null}
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
      <Stack direction="row" spacing={1}>
        <Button type="submit" disabled={!form.canSave}>
          {form.saving ? t('form.saving') : t('edit.save')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('form.cancel')}
        </Button>
      </Stack>
      <RemoveLink onClick={onRemove}>
        {t('common:edit.removeFromPantry')}
      </RemoveLink>
    </Stack>
  );
}

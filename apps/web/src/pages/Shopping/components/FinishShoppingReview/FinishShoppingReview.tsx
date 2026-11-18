import {
  Alert,
  Button,
  Spinner,
  Stack,
  Typography,
  radius,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { AmountField } from '@/components/AmountField';
import { ExpiryField, expiryContext } from '@/components/ExpiryPicker/index';
import { LocationToggle } from '@/components/LocationToggle';
import { useFinishReview } from '../../hooks/useFinishReview';

type Props = { onDone: () => void; onCancel: () => void };

/** Review screen: the proposed Batches for every checked item, editable, before anything is saved. */
export function FinishShoppingReview({ onDone, onCancel }: Props) {
  const { t, i18n } = useTranslation(['shopping', 'pantry', 'common']);
  const review = useFinishReview({ onDone });

  return (
    <Stack
      spacing={2}
      aria-label={t('shopping:finish.reviewTitle')}
      role="region"
    >
      <Typography variant="h2">{t('shopping:finish.reviewTitle')}</Typography>
      <Typography color="text.secondary">
        {t('shopping:finish.reviewHint')}
      </Typography>
      {review.error ? <Alert>{review.error}</Alert> : null}
      {review.stale ? (
        <Button type="button" variant="ghost" onClick={review.reload}>
          {t('shopping:finish.reload')}
        </Button>
      ) : null}
      {review.isLoading ? <Spinner label={t('common:loading')} /> : null}
      {review.isEmpty ? (
        <Typography>{t('shopping:finish.empty')}</Typography>
      ) : null}

      {review.lines.map(({ line, edit, dropped, quantityValid, usualDays }) => (
        <Stack
          key={line.itemId}
          component="section"
          aria-label={line.name}
          spacing={1.5}
          sx={{
            py: 2,
            px: { xs: 1, sm: 2 },
            border: 1,
            borderColor: 'divider',
            borderRadius: radius.card,
            opacity: dropped ? 0.5 : 1,
          }}
        >
          <Stack
            direction="row"
            sx={{ justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Typography sx={{ fontWeight: 700 }}>
              {line.name}
              {line.unmatched ? ` (${t('shopping:item.unmatched')})` : ''}
            </Typography>
            <Button
              variant="ghost"
              type="button"
              aria-pressed={dropped}
              onClick={() => review.toggleDrop(line.itemId)}
            >
              {dropped
                ? t('shopping:finish.restore', { name: line.name })
                : t('shopping:finish.drop', { name: line.name })}
            </Button>
          </Stack>
          {dropped ? null : (
            <>
              <AmountField
                name={line.name}
                quantity={edit.quantity}
                unit={edit.unit}
                onQuantityChange={(quantity, unit) =>
                  review.edit(line.itemId, {
                    quantity,
                    ...(unit ? { unit } : {}),
                  })
                }
                onUnitChange={(unit) => {
                  if (unit) review.edit(line.itemId, { unit });
                }}
                error={
                  quantityValid ? null : t('shopping:finish.quantityInvalid')
                }
                // Enter has no save here; Confirm below keeps the lines.
                onSubmit={() => {}}
                allowNoUnit={false}
                amountScale={line.amountScale}
              />
              <LocationToggle
                label={t('pantry:form.location')}
                value={edit.location}
                onChange={(location) => review.edit(line.itemId, { location })}
              />
              <ExpiryField
                label={t('pantry:picker.label')}
                value={edit.expiryDate}
                onChange={(expiryDate) =>
                  review.edit(line.itemId, { expiryDate })
                }
                usualDays={usualDays}
                context={expiryContext(
                  {
                    name: line.name,
                    quantity: edit.quantity,
                    unit: edit.unit,
                    location: edit.location,
                  },
                  i18n.language,
                  t,
                )}
              />
            </>
          )}
        </Stack>
      ))}

      <Stack direction="row" spacing={1}>
        {review.isEmpty ? null : (
          <Button
            type="button"
            disabled={!review.canConfirm}
            onClick={review.confirm}
          >
            {review.confirming
              ? t('shopping:finish.confirming')
              : t('shopping:finish.confirm', { count: review.keptCount })}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          sx={{ height: 52 }}
        >
          {t('shopping:finish.cancel')}
        </Button>
      </Stack>
    </Stack>
  );
}

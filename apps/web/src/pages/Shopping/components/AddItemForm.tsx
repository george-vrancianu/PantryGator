import {
  Box,
  Button,
  PlusIcon,
  Stack,
  TextField,
  Typography,
} from '@pocket-pantry/ui';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogSearch } from '@/components/catalogSearch/CatalogSearch/CatalogSearch';
import {
  UNITS,
  type CatalogSearchResult,
  type Unit,
} from '../../../lib/catalog';
import { parseQuantity } from '../../../lib/pantry';
import type { NewShoppingItem } from '../../../lib/shopping';

export type AddItemFormProps = {
  adding: boolean;
  onAdd: (item: NewShoppingItem) => Promise<boolean>;
};

/**
 * Pick the Catalog Match, or "Use as typed" for a name the Catalog does not
 * have (added as an Unmatched Shopping Item), with an optional quantity and unit.
 */
export function AddItemForm({ adding, onAdd }: AddItemFormProps) {
  const { t } = useTranslation('shopping');
  const [typedName, setTypedName] = useState<string | null>(null);
  const [match, setMatch] = useState<CatalogSearchResult | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<Unit | ''>('');
  // Remounts the search box to clear it after an add.
  const [formKey, setFormKey] = useState(0);

  const name = match?.name ?? typedName;
  const amount = parseQuantity(quantity);

  const select = (ingredient: CatalogSearchResult) => {
    setMatch(ingredient);
    setTypedName(null);
    setUnit(ingredient.defaultUnit);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name || !amount.valid) return;
    const added = await onAdd({
      ...(match ? { ingredientId: match.id } : { name }),
      ...(amount.value !== null ? { quantity: amount.value } : {}),
      ...(unit ? { unit } : {}),
    });
    if (!added) return;
    setTypedName(null);
    setMatch(null);
    setQuantity('');
    setUnit('');
    setFormKey((key) => key + 1);
  };

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <Stack spacing={1.5}>
        <CatalogSearch
          key={formKey}
          onSelect={select}
          onQueryChange={() => {
            setTypedName(null);
            setMatch(null);
          }}
          onUseTyped={(typed) => {
            setTypedName(typed);
            setMatch(null);
          }}
        />
        {typedName ? (
          <Typography variant="meta" color="text.secondary">
            {t('add.unmatchedHint')}
          </Typography>
        ) : null}
        <Stack direction="row" spacing={1.5}>
          <TextField
            label={t('add.quantity')}
            type="number"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            error={!amount.valid}
            helperText={amount.valid ? undefined : t('finish.quantityInvalid')}
            slotProps={{ htmlInput: { min: 0, step: 'any' } }}
          />
          <TextField
            select
            label={t('add.unit')}
            value={unit}
            onChange={(event) => setUnit(event.target.value as Unit | '')}
            slotProps={{ select: { native: true } }}
          >
            <option value="">{t('add.noUnit')}</option>
            {UNITS.map((value) => (
              <option key={value} value={value}>
                {t(`common:units.${value}`)}
              </option>
            ))}
          </TextField>
        </Stack>
        <Button
          type="submit"
          disabled={!name || !amount.valid || adding}
          startIcon={<PlusIcon />}
        >
          {t('add.submit')}
        </Button>
      </Stack>
    </Box>
  );
}

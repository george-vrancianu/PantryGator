import {
  Checkbox,
  Chip,
  Stack,
  TextField,
  Typography,
} from '@pocket-pantry/ui';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  localName,
  type AdminCatalog,
  type IngredientInput,
} from '@/lib/admin';
import { UNITS, type Unit } from '@/lib/catalog';
import { LeafCategoryField } from '../LeafCategoryField/LeafCategoryField';

type Props = {
  catalog: AdminCatalog;
  value: IngredientInput;
  onChange: (value: IngredientInput) => void;
  /**
   * `select` (default) is the plain selects of the resolver; `chips` is the Ingredient sheet:
   * a Leaf Category field-button and default-unit chips.
   */
  controls?: 'select' | 'chips';
  /** Shown right under the name field, e.g. the other languages' names. */
  afterName?: ReactNode;
};

/** An Ingredient's name, Leaf Category, default unit and Pantry Basic flag, as the Admin editors edit them. */
export function IngredientFields({
  catalog,
  value,
  onChange,
  controls = 'select',
  afterName,
}: Props) {
  const { t, i18n } = useTranslation('admin');
  const unitLabelId = useId();
  const leaves = catalog.leafCategories.map((leaf) => {
    const parent = catalog.parentCategories.find((p) => p.id === leaf.parentId);
    return {
      id: leaf.id,
      label: `${parent ? localName(parent, i18n.language) : ''} › ${localName(leaf, i18n.language)}`,
    };
  });

  return (
    <>
      <TextField
        label={t('admin:ingredient.name')}
        value={value.name}
        onChange={(event) => onChange({ ...value, name: event.target.value })}
        required
      />
      {afterName}
      {controls === 'chips' ? (
        <>
          <LeafCategoryField
            catalog={catalog}
            value={value.leafCategoryId}
            onChange={(leafCategoryId) =>
              onChange({ ...value, leafCategoryId })
            }
          />
          <Stack spacing={1}>
            <Typography
              id={unitLabelId}
              variant="sectionLabel"
              color="text.secondary"
            >
              {t('admin:ingredient.defaultUnit')}
            </Typography>
            <Stack
              direction="row"
              role="group"
              aria-labelledby={unitLabelId}
              sx={{ flexWrap: 'wrap', gap: 1 }}
            >
              {UNITS.map((unit) => (
                <Chip
                  key={unit}
                  label={t(`common:units.${unit}`)}
                  selected={value.defaultUnit === unit}
                  onClick={() => onChange({ ...value, defaultUnit: unit })}
                />
              ))}
            </Stack>
          </Stack>
        </>
      ) : (
        <>
          <TextField
            select
            label={t('admin:ingredient.leafCategory')}
            value={value.leafCategoryId}
            onChange={(event) =>
              onChange({ ...value, leafCategoryId: event.target.value })
            }
            slotProps={{ select: { native: true } }}
          >
            {leaves.map((leaf) => (
              <option key={leaf.id} value={leaf.id}>
                {leaf.label}
              </option>
            ))}
          </TextField>
          <TextField
            select
            label={t('admin:ingredient.defaultUnit')}
            value={value.defaultUnit}
            onChange={(event) =>
              onChange({ ...value, defaultUnit: event.target.value as Unit })
            }
            slotProps={{ select: { native: true } }}
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {t(`common:units.${unit}`)}
              </option>
            ))}
          </TextField>
        </>
      )}
      <Checkbox
        label={t('admin:ingredient.pantryBasic')}
        helperText={t('admin:ingredient.pantryBasicHint')}
        checked={value.pantryBasic}
        onChange={(event) =>
          onChange({ ...value, pantryBasic: event.target.checked })
        }
      />
    </>
  );
}

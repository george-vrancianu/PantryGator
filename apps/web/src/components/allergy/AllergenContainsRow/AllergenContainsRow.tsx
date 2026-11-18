import { Alert, Chip, Stack, Typography } from '@pocket-pantry/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useAllergenOptions } from '@/lib/catalog';

/**
 * What a Member says an Ingredient contains: nothing said (it stays Unchecked), "None"
 * (checked, contains no Allergen), or some Allergens (ADR 0014).
 */
export type ContainsSelection = { none: boolean; allergenIds: string[] };

export const BLANK_CONTAINS: ContainsSelection = {
  none: false,
  allergenIds: [],
};

/**
 * The selection for what an Ingredient is already known to contain. `undefined` is blank;
 * an empty list is "None". A Barcode Lookup pre-ticks the row this way (a proposal only).
 */
export function selectionFromAllergenIds(
  allergenIds: readonly string[] | undefined,
): ContainsSelection {
  if (allergenIds === undefined) return BLANK_CONTAINS;
  return { none: allergenIds.length === 0, allergenIds: [...allergenIds] };
}

/** The `allergenIds` to send: `undefined` for blank (left out), `[]` for "None". */
export function containsToAllergenIds(
  selection: ContainsSelection,
): string[] | undefined {
  if (selection.none) return [];
  return selection.allergenIds.length > 0 ? selection.allergenIds : undefined;
}

export type AllergenContainsRowProps = {
  value: ContainsSelection;
  onChange: (next: ContainsSelection) => void;
  disabled?: boolean;
  /**
   * Names for tags the Ingredient already has, so one the list no longer offers (a retired
   * Allergen) still shows as a selected chip. It can be unticked, and once it is, it is gone:
   * it is never offered as a new tag.
   */
  known?: readonly { id: string; name: string }[];
  /** Replaces the default hint line under the label. */
  hint?: string;
};

/**
 * The optional "Contains" row of Allergen chips with a "None" choice, for creating or tagging a
 * Family Ingredient. Controlled: start it from `selectionFromAllergenIds(initial)` and read it
 * with `containsToAllergenIds`. Picking a chip clears "None" and the other way round, so the
 * selection is always one of the three states.
 */
export function AllergenContainsRow({
  value,
  onChange,
  disabled,
  known = [],
  hint,
}: AllergenContainsRowProps) {
  const { t } = useTranslation('catalog');
  const labelId = useId();
  const options = useAllergenOptions();
  const picked = new Set(value.allergenIds);
  // Keep the list's order so what is sent reads the same everywhere.
  const order = options.data ?? [];
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    onChange({
      none: false,
      allergenIds: [
        ...order.filter((a) => next.has(a.id)).map((a) => a.id),
        // A tag the list no longer offers (retired) stays until unticked.
        ...[...next].filter((x) => !order.some((a) => a.id === x)),
      ],
    });
  };
  return (
    <Stack spacing={0.5}>
      <Typography id={labelId} variant="meta" sx={{ fontWeight: 700 }}>
        {t('allergenContains.label')}
      </Typography>
      <Typography variant="meta" color="text.secondary">
        {hint ?? t('allergenContains.hint')}
      </Typography>
      {options.isError ? (
        <Alert>{t('allergenContains.loadFailed')}</Alert>
      ) : null}
      <Stack
        direction="row"
        role="group"
        aria-labelledby={labelId}
        sx={{ flexWrap: 'wrap', gap: 1 }}
      >
        {order.map((allergen) => (
          <Chip
            key={allergen.id}
            label={allergen.name}
            selected={picked.has(allergen.id)}
            disabled={disabled}
            onClick={() => toggle(allergen.id)}
          />
        ))}
        {known
          .filter(
            (tag) => picked.has(tag.id) && !order.some((a) => a.id === tag.id),
          )
          .map((tag) => (
            <Chip
              key={tag.id}
              label={tag.name}
              selected
              disabled={disabled}
              onClick={() => toggle(tag.id)}
            />
          ))}
        {options.data ? (
          <Chip
            label={t('allergenContains.none')}
            selected={value.none}
            disabled={disabled}
            onClick={() =>
              onChange(
                value.none ? BLANK_CONTAINS : { none: true, allergenIds: [] },
              )
            }
          />
        ) : null}
      </Stack>
    </Stack>
  );
}

import {
  Alert,
  Box,
  CheckIcon,
  Stack,
  TextField,
  Typography,
} from '@pocket-pantry/ui';
import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { IngredientIconSlot } from '@/components/catalog/IngredientIconSlot/IngredientIconSlot';
import { translateApiError } from '@/i18n/translateApiError';
import type { CategoryOptions } from '@/lib/settings';
import { groupCategories, type CategoryRef } from '../../defaultExpiry';

export type CategoryPickerProps = {
  query: string;
  onQuery: (value: string) => void;
  searchRef: Ref<HTMLInputElement>;
  options: CategoryOptions | undefined;
  optionsPending: boolean;
  optionsError: unknown;
  onChoose: (id: string) => void;
  /** Leaves only: no "All {parent}" rows. */
  leavesOnly?: boolean;
  /** A leading Default Icon per row, tinted by the row's Aisle (see `aisleByParentId`). */
  showIcons?: boolean;
  /** Each Parent Category's Aisle by Parent Category id; a parent without one gets the neutral tint. */
  aisleByParentId?: ReadonlyMap<string, { id: string }>;
  /** The current leaf: label in the accent colour with a check, `aria-current`. */
  currentId?: string;
  /** Per-row content at the end of the row. */
  renderTrailing?: (row: CategoryRef) => ReactNode;
};

/** The category pick list: a search field over categories grouped by parent. */
export function CategoryPicker({
  query,
  onQuery,
  searchRef,
  options,
  optionsPending,
  optionsError,
  onChoose,
  leavesOnly = false,
  showIcons = false,
  aisleByParentId,
  currentId,
  renderTrailing,
}: CategoryPickerProps) {
  const { t } = useTranslation('settings');
  const groups = groupCategories(options, query, {}, leavesOnly);

  return (
    <Stack spacing={2} sx={{ px: 2, pb: 2 }}>
      <TextField
        fullWidth
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        slotProps={{
          htmlInput: {
            'aria-label': t('categoryPicker.search'),
            ref: searchRef,
          },
        }}
      />
      {optionsPending ? (
        <Typography role="status" color="text.secondary">
          {t('categoryPicker.loadingCategories')}
        </Typography>
      ) : null}
      {optionsError ? (
        <Alert>{translateApiError(t, optionsError)}</Alert>
      ) : null}
      {options && query.trim() !== '' && groups.length === 0 ? (
        <Typography color="text.secondary">
          {t('categoryPicker.noMatch', { query })}
        </Typography>
      ) : null}
      {groups.map((group) => (
        <Box key={group.parent.id} role="group" aria-label={group.parent.name}>
          <Typography
            variant="sectionLabel"
            component="p"
            color="text.secondary"
          >
            {group.parent.name}
          </Typography>
          <Stack>
            {group.rows.map((row) => {
              const current = row.id === currentId;
              return (
                <Box
                  key={row.id}
                  component="button"
                  type="button"
                  aria-current={current ? 'true' : undefined}
                  onClick={() => onChoose(row.id)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    minHeight: 46,
                    px: 1,
                    border: 0,
                    background: 'none',
                    color: 'inherit',
                    font: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {showIcons ? (
                    <IngredientIconSlot
                      aisleId={aisleByParentId?.get(group.parent.id)?.id}
                    />
                  ) : null}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body1"
                      sx={
                        current
                          ? { fontWeight: 600, color: 'pp.accent' }
                          : undefined
                      }
                    >
                      {row.wholeParent
                        ? t('categoryPicker.all', { parent: row.parentName })
                        : row.name}
                    </Typography>
                    {row.wholeParent ? (
                      <Typography variant="meta" color="text.secondary">
                        {t('categoryPicker.allHint', {
                          parent: row.parentName,
                        })}
                      </Typography>
                    ) : null}
                  </Box>
                  {renderTrailing?.(row)}
                  {current ? (
                    <Box
                      component="span"
                      sx={{ display: 'flex', color: 'pp.accent' }}
                    >
                      <CheckIcon size={18} />
                    </Box>
                  ) : null}
                </Box>
              );
            })}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

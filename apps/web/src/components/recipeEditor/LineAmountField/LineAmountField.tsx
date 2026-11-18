import {
  Box,
  ChevronDownIcon,
  TextField,
  focusRing,
  nestedRadius,
  radius,
  tokens,
} from '@pocket-pantry/ui';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { UNITS, type Unit } from '@/lib/catalog';

/** Field height in px: the row's ⌄ button, not the 50 px of the form fields. */
const HEIGHT = 40;
const CHIP_HEIGHT = 28;

type Props = {
  /** Ingredient name, for the accessible names. */
  name: string;
  quantity: string;
  unit: Unit;
  onQuantityChange: (quantity: string) => void;
  onUnitChange: (unit: Unit) => void;
  /** Whether the quantity is invalid; the message lives under the row. */
  error: boolean;
  /** Id of that message, for `aria-describedby`. */
  errorId: string;
  inputRef?: Ref<HTMLInputElement>;
};

/** An Ingredient Line's amount as one field: the quantity, then the unit as a chip (a native select) in its right edge. */
export function LineAmountField({
  name,
  quantity,
  unit,
  onQuantityChange,
  onUnitChange,
  error,
  errorId,
  inputRef,
}: Props) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <TextField
      hiddenLabel
      placeholder="–"
      value={quantity}
      onChange={(event) => onQuantityChange(event.target.value)}
      error={error}
      slotProps={{
        input: {
          endAdornment: (
            <Box
              sx={{
                position: 'relative',
                flexShrink: 0,
                ml: 1,
                mr: '-8px',
              }}
            >
              <Box
                component="select"
                value={unit}
                aria-label={t('admin:recipe.lines.unit', { name })}
                onChange={(event) =>
                  onUnitChange(
                    (event.target as HTMLSelectElement).value as Unit,
                  )
                }
                sx={{
                  appearance: 'none',
                  height: CHIP_HEIGHT,
                  pl: '8px',
                  pr: '22px',
                  border: 0,
                  borderRadius: nestedRadius(radius.control, 6),
                  backgroundColor: tokens.color.chipNeutral,
                  color: 'text.primary',
                  font: 'inherit',
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  ...focusRing,
                }}
              >
                {UNITS.map((option) => (
                  <option key={option} value={option}>
                    {t(`common:units.${option}`)}
                  </option>
                ))}
              </Box>
              <Box
                aria-hidden
                sx={{
                  position: 'absolute',
                  right: 5,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  pointerEvents: 'none',
                }}
              >
                <ChevronDownIcon size={14} />
              </Box>
            </Box>
          ),
        },
        htmlInput: {
          ref: inputRef,
          inputMode: 'decimal',
          'aria-label': t('admin:recipe.lines.quantity', { name }),
          'aria-describedby': error ? errorId : undefined,
          style: { textAlign: 'right', minWidth: 0 },
        },
      }}
      sx={{
        // 14 + number + 8 gap + chip (~58 for the widest unit, "buc.") + 6 leaves ~42 px: "1500" fits.
        width: 128,
        '& .MuiOutlinedInput-root': { minHeight: HEIGHT, height: HEIGHT },
        '& .MuiOutlinedInput-input': { py: 0 },
      }}
    />
  );
}

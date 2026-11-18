import { Box, tokens, radius } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { ExpirySheet, expiryContext } from '@/components/ExpiryPicker/index';
import { LOCATIONS, UNITS, type CatalogParent } from '@/lib/catalog';
import type { IsoDate } from '@/lib/pantry';
import {
  formatDate,
  isIsoDate,
  maskDateInput,
  parseDateInput,
} from '@/lib/dateFormat';
import { displayName, type ReviewLine } from '@/lib/review';
import { controlSx } from '../Field/Field';

/**
 * The inputs of a Review line for the tablet table, plus the Name, Description and Category inputs the phone edit
 * panel shares with it. The phone panel's amount, Location and expiry use the shared AmountField, LocationToggle and
 * ExpiryField; `useReviewLineExpiry` maps a line onto the expiry picker for both layouts.
 * `ariaLabel` names a control where the layout has no visible per-row label.
 */

type Change = (patch: Partial<ReviewLine>) => void;

type QuantityProps = {
  line: ReviewLine;
  onChange: Change;
  id: string;
  invalid: boolean;
  errorId: string;
  /** Names the quantity input; the unit select gets `unitAriaLabel`. */
  ariaLabel?: string;
  unitAriaLabel?: string;
};

/** Quantity and its unit in one bordered box; amber when the quantity is missing, urgent when invalid. */
export function QuantityUnitInput({
  line,
  onChange,
  id,
  invalid,
  errorId,
  ariaLabel,
  unitAriaLabel,
}: QuantityProps) {
  const { t } = useTranslation(['review', 'common']);
  const missing = line.quantity.trim() === '';
  const border = invalid
    ? tokens.color.urgentFg
    : missing
      ? tokens.color.soonBorder
      : tokens.color.line;
  return (
    <Box
      sx={{
        display: 'flex',
        height: 40,
        boxSizing: 'border-box',
        borderRadius: radius.control,
        border: `1px solid ${border}`,
        bgcolor: tokens.color.surface,
        overflow: 'hidden',
        '&:focus-within': {
          outline: `3px solid ${tokens.color.accent}`,
          outlineOffset: 1,
        },
      }}
    >
      <Box
        id={id}
        component="input"
        type="number"
        value={line.quantity}
        placeholder="0"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        onChange={(event) => onChange({ quantity: event.target.value })}
        min={0}
        step="any"
        inputMode="decimal"
        sx={{
          ...controlSx,
          flex: '1 1 0',
          minWidth: 0,
          width: 'auto',
          height: '100%',
          border: 0,
          borderRadius: 0,
          '&:focus-visible': { outline: 'none' },
        }}
      />
      <Box
        component="select"
        aria-label={unitAriaLabel ?? t('review:field.unit')}
        value={line.unit}
        onChange={(event) =>
          onChange({ unit: event.target.value as ReviewLine['unit'] })
        }
        sx={{
          ...controlSx,
          width: 'auto',
          height: '100%',
          border: 0,
          borderRadius: 0,
          borderLeft: `1px solid ${tokens.color.divider}`,
          bgcolor: tokens.color.subtle,
          '&:focus-visible': { outline: 'none' },
        }}
      >
        {UNITS.map((unit) => (
          <option key={unit} value={unit}>
            {t(`common:units.${unit}`)}
          </option>
        ))}
      </Box>
    </Box>
  );
}

export function LocationSelect({
  line,
  onChange,
  id,
  ariaLabel,
}: {
  line: ReviewLine;
  onChange: Change;
  id: string;
  ariaLabel?: string;
}) {
  const { t } = useTranslation('common');
  return (
    <Box
      id={id}
      component="select"
      value={line.location}
      aria-label={ariaLabel}
      onChange={(event) =>
        onChange({ location: event.target.value as ReviewLine['location'] })
      }
      sx={controlSx}
    >
      {LOCATIONS.map((location) => (
        <option key={location} value={location}>
          {t(`locations.${location}`)}
        </option>
      ))}
    </Box>
  );
}

/** A masked `dd.MM.yyyy` text field over the ISO date in state. */
export function ExpiryInput({
  line,
  onChange,
  id,
  error,
  errorId,
  onBlur,
  ariaLabel,
}: {
  line: ReviewLine;
  onChange: Change;
  id: string;
  error: boolean;
  errorId: string;
  onBlur: () => void;
  ariaLabel?: string;
}) {
  const { t } = useTranslation('review');
  return (
    <Box
      id={id}
      component="input"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={t('expiryPlaceholder')}
      aria-label={ariaLabel}
      value={
        isIsoDate(line.expiryDate)
          ? formatDate(line.expiryDate)
          : line.expiryDate
      }
      onBlur={onBlur}
      aria-invalid={error || undefined}
      aria-describedby={error ? errorId : undefined}
      onChange={(event) => {
        const masked = maskDateInput(event.target.value);
        onChange({
          expiryDate: parseDateInput(masked) ?? masked,
          expiryExplicit: true,
        });
      }}
      sx={{ ...controlSx, fontVariantNumeric: 'tabular-nums' }}
    />
  );
}

/**
 * The expiry picker's props for one line: its date, what a pick writes back, the Usual quick pick and the context
 * line. A date (or No expiry) picked is written to the line as an explicit expiry, the same as a typed one. Usual is
 * the Match's Default Expiry; there is none for an Unmatched line.
 */
export function useReviewLineExpiry(line: ReviewLine, onChange: Change) {
  const { t, i18n } = useTranslation(['pantry', 'common']);
  return {
    value: isIsoDate(line.expiryDate) ? line.expiryDate : null,
    onChange: (value: IsoDate | null) =>
      onChange({ expiryDate: value ?? '', expiryExplicit: true }),
    usualDays: line.match?.defaults.expiryDays ?? null,
    context: expiryContext(
      {
        name: displayName(line),
        quantity: line.quantity,
        unit: line.unit,
        location: line.location,
      },
      i18n.language,
      t,
    ),
  };
}

/** The expiry picker's sheet for one line, for the tablet table. */
export function ReviewLineExpirySheet({
  line,
  onChange,
  open,
  onClose,
  onExited,
}: {
  line: ReviewLine;
  onChange: Change;
  open: boolean;
  onClose: () => void;
  /** After the close transition, to put focus back on the opener. */
  onExited?: () => void;
}) {
  const { t } = useTranslation('pantry');
  const expiry = useReviewLineExpiry(line, onChange);
  return (
    <ExpirySheet
      open={open}
      onClose={onClose}
      onExited={onExited}
      {...expiry}
      title={t('picker.label')}
    />
  );
}

type TextProps = {
  line: ReviewLine;
  onChange: Change;
  id: string;
  ariaLabel?: string;
  /** Extra styling for a layout that wants the control compact or bold. */
  sx?: object;
};

/** An Unmatched line's name, as the Scan read it. */
export function NameInput({
  line,
  onChange,
  id,
  invalid,
  errorId,
  ariaLabel,
  sx,
}: TextProps & { invalid: boolean; errorId: string }) {
  return (
    <Box
      id={id}
      component="input"
      value={line.name}
      maxLength={100}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? errorId : undefined}
      onChange={(event) => onChange({ name: event.target.value })}
      sx={{ ...controlSx, ...sx }}
    />
  );
}

/** The Product Description saved with the Batch. */
export function DescriptionInput({
  line,
  onChange,
  id,
  ariaLabel,
  placeholder,
  sx,
}: TextProps & { placeholder?: string }) {
  return (
    <Box
      id={id}
      component="input"
      value={line.description}
      maxLength={200}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(event) => onChange({ description: event.target.value })}
      sx={{ ...controlSx, ...sx }}
    />
  );
}

/** An Unmatched line's Parent Category; empty leaves it to the server's default. */
export function CategorySelect({
  line,
  onChange,
  id,
  parents,
  ariaLabel,
  otherLabel,
  sx,
}: TextProps & { parents: CatalogParent[]; otherLabel: string }) {
  return (
    <Box
      id={id}
      component="select"
      value={line.parentCategoryId}
      aria-label={ariaLabel}
      onChange={(event) => onChange({ parentCategoryId: event.target.value })}
      sx={{ ...controlSx, ...sx }}
    >
      <option value="">{otherLabel}</option>
      {parents.map((parent) => (
        <option key={parent.id} value={parent.id}>
          {parent.name}
        </option>
      ))}
    </Box>
  );
}

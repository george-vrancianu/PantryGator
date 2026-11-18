import {
  Box,
  CalendarIcon,
  ChevronRightIcon,
  Typography,
  tokens,
  nestedRadius,
  radius,
} from '@pocket-pantry/ui';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dateAndRelativeDay, useExpiryTags, type IsoDate } from '@/lib/pantry';
import { useToday } from '@/lib/useToday';
import { ExpiryTag } from '@/components/pantry/ExpiryTag/ExpiryTag';
import type { DateRange } from '../calendarMonths';
import { ExpirySheet } from '../ExpirySheet/ExpirySheet';

export type ExpiryFieldProps = {
  /** The summary row's id (the label above points at it). */
  id?: string;
  /** The label above the row, which also starts its accessible name, e.g. "Expires". */
  label: string;
  /** Null for no expiry. */
  value: IsoDate | null;
  /** Called on every tap in the sheet, so closing it never throws a change away. */
  onChange: (value: IsoDate | null) => void;
  /** The Default Expiry in days, for the "Usual" quick pick; null when there is none (or for an Unmatched name). */
  usualDays: number | null;
  /** The sheet's context line, e.g. "Greek yogurt · 500 g · Fridge". */
  context: string;
  /** Limits the days to choose from; the field then has no tag and no No expiry (a start date, say). */
  range?: DateRange;
  /** Why the date is invalid, or null/left out when it is fine; shown under the row and read as its description. */
  error?: string | null;
};

/**
 * The expiry summary row of a form: a calendar tile, the date and how far away it is (or "No expiry date"), its tag
 * and a chevron. Tapping it opens the `ExpirySheet`.
 */
export function ExpiryField({
  id,
  label,
  value,
  onChange,
  usualDays,
  context,
  range,
  error,
}: ExpiryFieldProps) {
  const { t, i18n } = useTranslation('pantry');
  const fallbackId = useId();
  const errorId = useId();
  const rowId = id ?? fallbackId;
  const [open, setOpen] = useState(false);
  const row = useRef<HTMLButtonElement>(null);
  const today = useToday();
  const { tagFor } = useExpiryTags(today);
  const { color } = tokens;
  const shown =
    value === null ? null : dateAndRelativeDay(value, today, i18n.language);

  const name =
    value === null
      ? t('picker.summaryNone', { label })
      : t('picker.summary', {
          label,
          ...dateAndRelativeDay(value, today, i18n.language, 'long'),
        });

  return (
    <Box>
      <Typography
        component="label"
        htmlFor={rowId}
        variant="sectionLabel"
        color="text.secondary"
        sx={{ display: 'block', px: '2px', mb: 0.5 }}
      >
        {label}
      </Typography>
      <Box
        ref={row}
        component="button"
        type="button"
        id={rowId}
        aria-haspopup="dialog"
        aria-label={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onClick={() => setOpen(true)}
        sx={{
          width: '100%',
          minHeight: 56,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          p: '8px 10px 8px 14px',
          borderRadius: radius.control,
          border: `1.5px solid ${error ? color.urgentFg : color.line}`,
          backgroundColor: color.surface,
          color: color.ink,
          font: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
          '&:focus-visible': {
            outline: 'none',
            borderColor: error ? color.urgentFg : color.accent,
            boxShadow: `0 0 0 3px ${color.accentTint}`,
          },
        }}
      >
        <Box
          component="span"
          sx={{
            flex: 'none',
            width: 36,
            height: 36,
            display: 'grid',
            placeItems: 'center',
            borderRadius: nestedRadius(radius.control, 2),
            backgroundColor: color.accentTint,
            color: color.accentOnTint,
          }}
        >
          <CalendarIcon size={18} />
        </Box>
        <Box
          component="span"
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '1px',
          }}
        >
          <Box
            component="span"
            sx={{
              fontSize: 15,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {shown === null ? t('picker.none') : shown.date}
          </Box>
          <Box component="span" sx={{ fontSize: 12.5, color: color.muted }}>
            {shown === null ? t('picker.tapToSet') : shown.relative}
          </Box>
        </Box>
        {value === null || range ? null : <ExpiryTag tag={tagFor(value)} />}
        <ChevronRightIcon
          size={18}
          color={color.muted}
          style={{ flex: 'none' }}
        />
      </Box>
      {error ? (
        <Typography
          id={errorId}
          variant="meta"
          sx={{ display: 'block', mt: 0.75, color: color.urgentFg }}
        >
          {error}
        </Typography>
      ) : null}
      <ExpirySheet
        open={open}
        onClose={() => setOpen(false)}
        // MUI restores focus to the opener, but a tap doesn't always focus it (Safari), so focus it here.
        onExited={() => row.current?.focus()}
        value={value}
        onChange={onChange}
        usualDays={usualDays}
        context={context}
        title={label}
        range={range}
      />
    </Box>
  );
}

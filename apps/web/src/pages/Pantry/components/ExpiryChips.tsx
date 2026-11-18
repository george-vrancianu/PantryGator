import {
  Box,
  CalendarDaysIcon,
  color,
  focusRing,
  radius,
} from '@pocket-pantry/ui';
import { useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { ExpirySheet } from '@/components/expiryPicker/ExpirySheet/ExpirySheet';
import {
  dateAndRelativeDay,
  defaultExpiryDate,
  type IsoDate,
} from '../../../lib/pantry';
import { useToday } from '../../../lib/useToday';

/** Fixed quick picks, in days: 3 d, 1 wk, 2 wk, 1 mo (a month is 30 days). */
const QUICK_DAYS = [3, 7, 14, 30] as const;

type Props = {
  /** Null for no expiry date. */
  value: IsoDate | null;
  onChange: (value: IsoDate | null) => void;
  /** The Default Expiry in days; null hides the Usual chip. */
  usualDays: number | null;
  /** The name the "usual for {name}" note speaks of. */
  name: string;
  /** The expiry sheet's context line. */
  context: string;
};

/** Days as a short chip label: "10 d", "1 wk", "1 mo", "18 mo". */
function useDaysLabel() {
  const { t } = useTranslation('pantry');
  return (days: number) => {
    const [count, unit] =
      days % 30 === 0
        ? [days / 30, 'Month']
        : days % 7 === 0
          ? [days / 7, 'Week']
          : [days, 'Day'];
    return `${count} ${t(`picker.unit${unit}`, { count })}`;
  };
}

/**
 * Expires: chips for Usual (the Default Expiry), 3 d, 1 wk, 2 wk, 1 mo and No date, a calendar chip for any
 * other day, and under them the resolved date. A value equal to the usual one selects Usual.
 */
export function ExpiryChips({
  value,
  onChange,
  usualDays,
  name,
  context,
}: Props) {
  const { t, i18n } = useTranslation('pantry');
  const today = useToday();
  const daysLabel = useDaysLabel();
  const lineId = useId();
  const [sheetOpen, setSheetOpen] = useState(false);
  const calendarChip = useRef<HTMLButtonElement>(null);

  const iso = (days: number) => defaultExpiryDate(days, today) as IsoDate;
  const usualSelected =
    usualDays !== null && value !== null && value === iso(usualDays);
  const quickSelected = (days: number) =>
    !usualSelected && value !== null && value === iso(days);
  const noDateSelected = value === null;
  const calendarSelected =
    value !== null &&
    !usualSelected &&
    !QUICK_DAYS.some((days) => quickSelected(days));
  const calendarDate =
    calendarSelected && value !== null
      ? dateAndRelativeDay(value, today, i18n.language).date
      : '';
  const shown =
    value === null ? null : dateAndRelativeDay(value, today, i18n.language);

  const chip = (
    key: string,
    label: string,
    pressed: boolean,
    onClick: () => void,
    extra?: {
      'aria-label'?: string;
      'aria-haspopup'?: 'dialog';
      icon?: ReactNode;
      ref?: Ref<HTMLButtonElement>;
    },
  ) => (
    <Box
      key={key}
      ref={extra?.ref}
      component="button"
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      aria-label={extra?.['aria-label']}
      aria-haspopup={extra?.['aria-haspopup']}
      sx={{
        flex: 'none',
        minHeight: 36,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        px: '14px',
        font: 'inherit',
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        color: pressed ? color.accentInk : 'text.primary',
        backgroundColor: pressed ? 'pp.accent' : color.cardBg,
        border: '1px solid',
        borderColor: pressed ? 'transparent' : 'pp.line',
        borderRadius: radius.chip,
        cursor: 'pointer',
        ...focusRing,
      }}
    >
      {extra?.icon}
      {label}
    </Box>
  );

  return (
    <Box>
      <Box
        role="group"
        aria-label={t('picker.label')}
        aria-describedby={lineId}
        sx={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          pb: '2px',
        }}
      >
        {usualDays !== null
          ? chip(
              'usual',
              t('form.usualChip', { value: daysLabel(usualDays) }),
              usualSelected,
              () => onChange(iso(usualDays)),
            )
          : null}
        {QUICK_DAYS.map((days) =>
          chip(String(days), daysLabel(days), quickSelected(days), () =>
            onChange(iso(days)),
          ),
        )}
        {chip('none', t('form.noDate'), noDateSelected, () => onChange(null))}
        {chip(
          'calendar',
          calendarDate,
          calendarSelected,
          () => setSheetOpen(true),
          {
            // The visible date is part of the name (label in name).
            'aria-label': calendarDate
              ? `${t('picker.calendar')}, ${calendarDate}`
              : t('picker.calendar'),
            'aria-haspopup': 'dialog',
            icon: <CalendarDaysIcon size={16} aria-hidden />,
            ref: calendarChip,
          },
        )}
      </Box>
      <Box
        id={lineId}
        sx={{
          mt: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: 13,
        }}
      >
        <CalendarDaysIcon size={16} aria-hidden />
        <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
          {shown === null
            ? t('picker.none')
            : `${shown.date} · ${shown.relative}`}
          {usualSelected ? (
            <Box
              component="span"
              sx={{ fontWeight: 400, color: 'text.secondary' }}
            >
              {` · ${t('form.usualFor', { name })}`}
            </Box>
          ) : null}
        </Box>
      </Box>
      <ExpirySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        // MUI restores focus to the opener, but a tap doesn't always focus it (Safari), so focus it here.
        onExited={() => calendarChip.current?.focus()}
        value={value}
        onChange={onChange}
        usualDays={usualDays}
        context={context}
        title={t('picker.label')}
      />
    </Box>
  );
}

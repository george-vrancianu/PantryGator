import {
  Box,
  Button,
  CloseIcon,
  Sheet,
  Stack,
  Typography,
  tokens,
} from '@pocket-pantry/ui';
import { useMemo, useRef, type Ref, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  dateAndRelativeDay,
  useExpiryTags,
  type ExpiryTagState,
  type IsoDate,
} from '../../lib/pantry';
import { useToday } from '../../lib/useToday';
import { ExpiryTag } from '../ExpiryTag';
import { ExpiryCalendar, type ExpiryCalendarHandle } from './ExpiryCalendar';
import type { DateRange } from './calendarMonths';
import { QuickPicks } from './QuickPicks';

export type ExpirySheetProps = {
  open: boolean;
  /** Done, the scrim and Escape. The value is already saved through `onChange`, so closing never discards. */
  onClose: () => void;
  /** After the close transition, with focus back on the opener. */
  onExited?: () => void;
  /** Null for no expiry. */
  value: IsoDate | null;
  /** Called on every tap. */
  onChange: (value: IsoDate | null) => void;
  /** The Default Expiry in days, for the "Usual" quick pick; null when there is none. */
  usualDays: number | null;
  /** The line under the title, e.g. "Greek yogurt · 500 g · Fridge". */
  context: string;
  /** The title and the dialog's name, e.g. "Expires". */
  title: string;
  /** Limits the days to choose from and drops what only makes sense for an expiry: quick picks, the tag and No expiry. */
  range?: DateRange;
};

/**
 * The expiry picker's bottom sheet: title and context, a readout of the chosen date and the tag it will get, the
 * calendar, and No expiry / Done. Every tap goes straight to `onChange`.
 */
export function ExpirySheet({
  open,
  onClose,
  onExited,
  value,
  onChange,
  usualDays,
  context,
  title,
  range,
}: ExpirySheetProps) {
  const { t, i18n } = useTranslation('pantry');
  const quickPicks = useRef<HTMLDivElement>(null);
  // The selected quick pick, or the first: a button, so a phone keyboard stays down.
  const quickPick = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        const tiles = quickPicks.current;
        return (
          tiles?.querySelector<HTMLElement>('.tile[aria-pressed="true"]') ??
          tiles?.querySelector<HTMLElement>('.tile') ??
          null
        );
      },
    }),
    [],
  );
  const today = useToday();
  const { staleThresholdDays, tagFor } = useExpiryTags(today);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      initialFocus={quickPick}
      onExited={onExited}
      label={title}
      size="content"
      header={
        <Box sx={{ px: 3, pt: 2, pb: 1.5 }}>
          <Typography component="h2" variant="h3">
            {title}
          </Typography>
          <Typography variant="meta" color="text.secondary" sx={{ mt: '3px' }}>
            {context}
          </Typography>
          <Readout
            text={
              value === null
                ? null
                : dateAndRelativeDay(value, today, i18n.language)
            }
            tag={range ? null : tagFor(value)}
          />
        </Box>
      }
      footer={
        <Stack direction="row" spacing={1.25} sx={{ px: 3, py: 1.5 }}>
          {range ? null : (
            <Button
              type="button"
              variant="ghost"
              aria-pressed={value === null}
              startIcon={<CloseIcon size={16} strokeWidth={2.4} />}
              onClick={() => onChange(null)}
              sx={{ flex: 'none', whiteSpace: 'nowrap' }}
            >
              {t('picker.clear')}
            </Button>
          )}
          <Button type="button" onClick={onClose} sx={{ flex: 1 }}>
            {t('picker.done')}
          </Button>
        </Stack>
      }
    >
      <SheetBody
        quickPicks={quickPicks}
        value={value}
        onChange={onChange}
        usualDays={usualDays}
        today={today}
        staleThresholdDays={staleThresholdDays}
        range={range}
      />
    </Sheet>
  );
}

/** Mounted with the open sheet, so the calendar opens on the value's month every time. */
function SheetBody({
  quickPicks,
  value,
  onChange,
  usualDays,
  today,
  staleThresholdDays,
  range,
}: Pick<ExpirySheetProps, 'value' | 'onChange' | 'usualDays' | 'range'> & {
  quickPicks: Ref<HTMLDivElement>;
  today: Date;
  staleThresholdDays: number;
}) {
  const calendar = useRef<ExpiryCalendarHandle>(null);
  return (
    <Box sx={{ px: 3, pt: 0.5, pb: 2 }}>
      {range ? null : (
        <QuickPicks
          ref={quickPicks}
          value={value}
          usualDays={usualDays}
          today={today}
          onPick={(iso) => {
            onChange(iso);
            calendar.current?.scrollToMonth(iso, true);
          }}
        />
      )}
      <ExpiryCalendar
        ref={calendar}
        value={value}
        onChange={onChange}
        today={today}
        usualDays={usualDays}
        staleThresholdDays={staleThresholdDays}
        range={range}
      />
    </Box>
  );
}

/** The chosen date, how far away it is and the tag it will get; "No expiry date" when empty. */
function Readout({
  text,
  tag,
}: {
  /** The chosen date and how far away it is; null for no expiry. */
  text: { date: string; relative: string } | null;
  tag: ExpiryTagState | null;
}) {
  const { t } = useTranslation('pantry');
  return (
    <Box
      role="status"
      sx={{
        mt: 1.5,
        minHeight: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        px: '2px',
      }}
    >
      {text === null ? (
        <Box
          component="span"
          sx={{ fontSize: 14, fontWeight: 500, color: tokens.color.muted }}
        >
          {t('picker.none')}
        </Box>
      ) : (
        <Box
          component="span"
          sx={{
            fontSize: 14,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {text.date}
          <Box
            component="small"
            sx={{
              ml: '6px',
              fontSize: 13,
              fontWeight: 500,
              color: tokens.color.muted,
            }}
          >
            {text.relative}
          </Box>
        </Box>
      )}
      {/* "No expiry date" beside it already says it. */}
      {tag ? <ExpiryTag tag={tag} decorative={text === null} /> : null}
    </Box>
  );
}

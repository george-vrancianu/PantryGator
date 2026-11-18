import { Box, Sheet, palette } from '@pocket-pantry/ui';
import { useMemo, useRef, useState, type Ref, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  dateAndRelativeDay,
  useExpiryTags,
  type ExpiryTagState,
  type IsoDate,
} from '@/lib/pantry';
import { useToday } from '@/lib/useToday';
import { ExpiryTag } from '@/components/pantry/ExpiryTag/ExpiryTag';
import {
  ExpiryCalendar,
  type ExpiryCalendarHandle,
} from './ExpiryCalendar/ExpiryCalendar';
import type { DateRange } from '../calendarMonths';
import { QuickPicks } from './QuickPicks/QuickPicks';

export type ExpirySheetProps = {
  open: boolean;
  /** Closes the sheet. The X, the scrim and Escape discard the draft; Done and No expiry call `onChange` first. */
  onClose: () => void;
  /** After the close transition, with focus back on the opener. */
  onExited?: () => void;
  /** Null for no expiry. */
  value: IsoDate | null;
  /** Called with the draft when Done is tapped, or with null when No expiry is tapped. */
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
 * calendar, and No expiry / Done. Taps change a draft; only Done (or No expiry) commits it through `onChange`.
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
  // The draft starts from `value` every time the sheet opens, and again if `value` changes under it.
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState({ open, value });
  if (open !== seen.open || value !== seen.value) {
    setSeen({ open, value });
    if (open) setDraft(value);
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      initialFocus={quickPick}
      onExited={onExited}
      title={title}
      subtitle={context}
      size="content"
      primary={{
        label: t('picker.done'),
        onClick: () => {
          onChange(draft);
          onClose();
        },
      }}
      secondary={
        range
          ? undefined
          : {
              label: t('picker.clear'),
              onClick: () => {
                onChange(null);
                onClose();
              },
            }
      }
    >
      <Box sx={{ px: 3, pt: 0.5 }}>
        <Readout
          text={
            draft === null
              ? null
              : dateAndRelativeDay(draft, today, i18n.language)
          }
          tag={range ? null : tagFor(draft)}
        />
      </Box>
      <SheetBody
        quickPicks={quickPicks}
        value={draft}
        onChange={setDraft}
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
          sx={{
            fontSize: 14,
            fontWeight: 500,
            color: palette('text-secondary'),
          }}
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
              color: palette('text-secondary'),
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

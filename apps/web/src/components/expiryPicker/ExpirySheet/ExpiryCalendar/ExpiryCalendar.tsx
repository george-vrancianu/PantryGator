import {
  Box,
  palette,
  usePrefersReducedMotion,
  color,
  displayType,
  nestedRadius,
  radius,
  shadow,
  focusRing,
} from '@pocket-pantry/ui';
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  daysUntil,
  defaultExpiryDate,
  fromIso,
  isExpiringSoon,
  localDate,
  localIso,
  type IsoDate,
} from '@/lib/pantry';
import {
  calendarMonths,
  daysInMonth,
  monthKey,
  type DateRange,
} from '../../calendarMonths';

export type ExpiryCalendarHandle = {
  /**
   * Scroll the list so the month of `iso` is at the top: smoothly when `smooth` (and motion is allowed),
   * instantly otherwise. For quick picks and the Today link.
   */
  scrollToMonth: (iso: IsoDate, smooth: boolean) => void;
};

export type ExpiryCalendarProps = {
  ref?: Ref<ExpiryCalendarHandle>;
  value: IsoDate | null;
  /** A day was tapped. */
  onChange: (iso: IsoDate) => void;
  today: Date;
  /** The Default Expiry in days, so the Usual date is always in the range; null when there is none. */
  usualDays: number | null;
  /** Days from today through today + this are the Expiring Soon band. */
  staleThresholdDays: number;
  /** Only these days can be chosen (a start date, say); the Expiring Soon band is then not drawn. */
  range?: DateRange;
};

/** Days an arrow key moves by. */
const ARROW_STEP: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

/**
 * The day a key moves focus to from `iso`, or null when it doesn't move: arrows stay within the month, Home/End
 * go to the Monday/Sunday of the week (cut at the month's edge), and Page Up/Down keep the day of the month,
 * falling back to the last day of a shorter month.
 */
function keyTarget(
  iso: IsoDate,
  key: string,
  range?: DateRange,
): IsoDate | null {
  const target = rawKeyTarget(iso, key);
  if (target === null || !range) return target;
  // Arrows stop at the range's edge; the other keys land on its nearest day.
  if (key in ARROW_STEP) {
    return target < range.min || target > range.max ? null : target;
  }
  return clampTo(target, range);
}

const clampTo = (iso: IsoDate, range?: DateRange): IsoDate =>
  !range
    ? iso
    : iso < range.min
      ? range.min
      : iso > range.max
        ? range.max
        : iso;

function rawKeyTarget(iso: IsoDate, key: string): IsoDate | null {
  const day = fromIso(iso);
  const step = ARROW_STEP[key];
  if (step !== undefined) {
    const next = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate() + step,
    );
    return next.getMonth() === day.getMonth() ? localIso(next) : null;
  }
  if (key === 'Home' || key === 'End') {
    const weekday = (day.getDay() + 6) % 7; // Monday is 0
    const offset = key === 'Home' ? -weekday : 6 - weekday;
    const length = daysInMonth(day.getFullYear(), day.getMonth());
    const date = Math.min(Math.max(day.getDate() + offset, 1), length);
    return localIso(localDate(day.getFullYear(), day.getMonth(), date));
  }
  const months = key === 'PageDown' ? 1 : key === 'PageUp' ? -1 : 0;
  if (months === 0) return null;
  const target = new Date(day.getFullYear(), day.getMonth() + months, 1);
  const length = daysInMonth(target.getFullYear(), target.getMonth());
  return localIso(
    new Date(
      target.getFullYear(),
      target.getMonth(),
      Math.min(day.getDate(), length),
    ),
  );
}

/** A Monday, for the weekday initials. */
const MONDAY = new Date(2024, 0, 1);

/**
 * The calendar card of the expiry sheet: weekday initials (Monday first), a vertically scrolling list of whole
 * months with sticky names, and a legend for the Expiring Soon band. It opens on the value's month (today's when
 * empty) and keeps its place when a day is tapped.
 */
export function ExpiryCalendar({
  ref,
  value,
  onChange,
  today,
  usualDays,
  staleThresholdDays,
  range,
}: ExpiryCalendarProps) {
  const { t, i18n } = useTranslation('pantry');
  const reduceMotion = usePrefersReducedMotion();
  const legendId = useId();
  const headingId = useId();
  const scroller = useRef<HTMLDivElement>(null);
  // The range is fixed while the sheet is open, so clearing a far value doesn't pull the list out from under it.
  const [months] = useState(() =>
    calendarMonths(
      today,
      value,
      usualDays === null ? null : defaultExpiryDate(usualDays, today),
      range,
    ),
  );

  const scrollToMonth = useCallback(
    (iso: IsoDate, smooth: boolean) => {
      const list = scroller.current;
      const month = list?.querySelector<HTMLElement>(
        `[data-month="${monthKey(iso)}"]`,
      );
      if (!list || !month) return;
      const top = month.offsetTop;
      if (typeof list.scrollTo === 'function')
        list.scrollTo({
          top,
          behavior: smooth && !reduceMotion ? 'smooth' : 'auto',
        });
      else list.scrollTop = top;
    },
    [reduceMotion],
  );

  useImperativeHandle(ref, () => ({ scrollToMonth }), [scrollToMonth]);

  // The calendar is a single Tab stop: the selected day when it is shown, otherwise today (until a day is focused).
  const shown = (iso: IsoDate | null) =>
    iso !== null && months.some((month) => month.key === monthKey(iso));
  const initialStop = clampTo(
    value !== null && shown(value) ? value : localIso(today),
    range,
  );
  // Roving tabindex: the Tab stop follows the focused day, so Shift+Tab back lands where the arrows left off.
  const [focusIso, setFocusIso] = useState<IsoDate | null>(null);
  // A new selection (a quick pick, No expiry) takes the Tab stop back.
  useEffect(() => setFocusIso(null), [value]);
  const tabStop = focusIso !== null && shown(focusIso) ? focusIso : initialStop;

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const from = (event.target as HTMLElement).closest<HTMLElement>('.day')
      ?.dataset.iso;
    if (!from) return;
    const to = keyTarget(from, event.key, range);
    if (to === null) {
      // Page Up/Down would otherwise scroll the list away from the focused day.
      if (event.key === 'PageUp' || event.key === 'PageDown')
        event.preventDefault();
      return;
    }
    event.preventDefault();
    setFocusIso(to);
    scroller.current
      ?.querySelector<HTMLElement>(`.day[data-iso="${to}"]`)
      ?.focus();
  };

  // Opens straight on the value's month; after that only an explicit request scrolls.
  useLayoutEffect(() => {
    scrollToMonth(value ?? localIso(today), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' });
  const monthName = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    year: 'numeric',
  });
  const dayName = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const grid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '2px',
  } as const;
  // A mask: only its alpha counts, so the colour is not a Theme colour.
  const fade =
    'linear-gradient(to bottom, transparent, black 14px, black calc(100% - 18px), transparent)';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: palette('background-paper'),
        border: `1px solid ${palette('pp-line')}`,
        borderRadius: radius.card,
      }}
    >
      <Box
        aria-hidden
        sx={{
          ...grid,
          p: '8px 8px 4px',
          borderBottom: `1px solid ${palette('divider')}`,
        }}
      >
        {Array.from({ length: 7 }, (_, index) => (
          <Box
            key={index}
            component="span"
            sx={{
              fontSize: 11,
              fontWeight: 700,
              color: palette('text-secondary'),
              textAlign: 'center',
              letterSpacing: '.04em',
            }}
          >
            {weekday.format(
              new Date(
                MONDAY.getFullYear(),
                MONDAY.getMonth(),
                MONDAY.getDate() + index,
              ),
            )}
          </Box>
        ))}
      </Box>
      <Box
        ref={scroller}
        role="group"
        aria-label={t('picker.calendar')}
        onKeyDown={onKeyDown}
        sx={{
          position: 'relative',
          height: 264,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          scrollSnapType: 'y proximity',
          maskImage: fade,
          WebkitMaskImage: fade,
          '& .day': {
            justifySelf: 'center',
            width: 34,
            height: 34,
            p: 0,
            border: 0,
            borderRadius: '50%',
            position: 'relative',
            display: 'grid',
            placeItems: 'center',
            font: 'inherit',
            fontSize: 13.5,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            color: palette('text-primary'),
            backgroundColor: 'transparent',
            cursor: 'pointer',
            transition: 'background-color .1s',
            '&:hover': { backgroundColor: palette('pp-chip') },
            ...focusRing,
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          },
          '& .day[data-past]': { color: palette('text-secondary') },
          '& .day:disabled': { opacity: 0.35, cursor: 'default' },
          '& .day[data-band]': {
            backgroundColor: `color-mix(in srgb, ${palette('warning-light')} 70%, transparent)`,
          },
          '& .day[aria-current="date"]::after': {
            content: '""',
            position: 'absolute',
            bottom: 3,
            left: '50%',
            width: 4,
            height: 4,
            ml: '-2px',
            borderRadius: '50%',
            backgroundColor: palette('pp-accent'),
          },
          '& .day[aria-pressed="true"]': {
            backgroundColor: palette('pp-accent'),
            color: color.accentInk,
            boxShadow: shadow.button,
          },
          '& .day[aria-pressed="true"]::after': {
            backgroundColor: color.accentInk,
          },
        }}
      >
        {months.map((month) => {
          const id = `${headingId}-${month.key}`;
          return (
            <Box
              key={month.key}
              data-month={month.key}
              sx={{ p: '0 8px 6px', scrollSnapAlign: 'start' }}
            >
              <Box
                component="h3"
                id={id}
                sx={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  m: 0,
                  p: '8px 4px 4px',
                  backgroundColor: palette('background-paper'),
                  ...displayType,
                  fontSize: 15,
                }}
              >
                {monthName.format(month.first)}
              </Box>
              <Box role="grid" aria-labelledby={id}>
                {month.weeks.map((week, row) => (
                  <Box key={row} role="row" sx={{ ...grid, mb: '2px' }}>
                    {week.map((iso, column) => {
                      if (iso === null)
                        // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- empty padding cell before the 1st of the month, no control
                        return <span key={column} role="gridcell" />;
                      const days = daysUntil(iso, today);
                      const inBand =
                        !range && isExpiringSoon(days, staleThresholdDays);
                      const outOfRange =
                        range !== undefined &&
                        (iso < range.min || iso > range.max);
                      return (
                        <Box key={iso} role="gridcell" sx={{ display: 'grid' }}>
                          <button
                            type="button"
                            className="day"
                            data-iso={iso}
                            tabIndex={iso === tabStop ? 0 : -1}
                            aria-label={dayName.format(fromIso(iso))}
                            aria-pressed={iso === value}
                            aria-current={days === 0 ? 'date' : undefined}
                            aria-describedby={inBand ? legendId : undefined}
                            data-past={days < 0 ? '' : undefined}
                            data-band={inBand ? '' : undefined}
                            disabled={outOfRange}
                            onFocus={() => setFocusIso(iso)}
                            onClick={() => onChange(iso)}
                          >
                            {fromIso(iso).getDate()}
                          </button>
                        </Box>
                      );
                    })}
                  </Box>
                ))}
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 36,
          p: '6px 10px',
          borderTop: `1px solid ${palette('divider')}`,
          fontSize: 12.5,
          color: palette('text-secondary'),
        }}
      >
        {range ? (
          <span />
        ) : (
          <Box
            component="span"
            sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Box
              component="span"
              aria-hidden
              sx={{
                width: 10,
                height: 10,
                borderRadius: nestedRadius(radius.box, 4),
                backgroundColor: palette('warning-light'),
              }}
            />
            <span id={legendId}>
              {t('picker.within', { count: staleThresholdDays })}
            </span>
          </Box>
        )}
        <Box
          component="button"
          type="button"
          onClick={() => scrollToMonth(localIso(today), true)}
          sx={{
            p: '4px 2px',
            border: 0,
            borderRadius: nestedRadius(radius.control, 6),
            backgroundColor: 'transparent',
            font: 'inherit',
            fontSize: 13,
            fontWeight: 700,
            color: palette('pp-accent'),
            cursor: 'pointer',
            ...focusRing,
          }}
        >
          {t('picker.today')}
        </Box>
      </Box>
    </Box>
  );
}

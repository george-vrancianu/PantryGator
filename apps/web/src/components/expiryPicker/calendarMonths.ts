import { fromIso, localDate, localIso, type IsoDate } from '@/lib/pantry';

export type CalendarMonth = {
  /** `YYYY-MM`. */
  key: string;
  /** The 1st of the month, local midnight, for formatting its name. */
  first: Date;
  /** Monday-first weeks of `YYYY-MM-DD` days; `null` pads the first and last week. */
  weeks: (IsoDate | null)[][];
};

/** `YYYY-MM` of a `YYYY-MM-DD` date. */
export const monthKey = (iso: IsoDate) => iso.slice(0, 7);

/** How many days a month has; `monthIndex` is 0-based. */
export const daysInMonth = (year: number, monthIndex: number) =>
  localDate(year, monthIndex + 1, 0).getDate();

function weeksOf(year: number, monthIndex: number): (IsoDate | null)[][] {
  const first = localDate(year, monthIndex, 1);
  // Weeks start on Monday in every locale.
  const lead = (first.getDay() + 6) % 7;
  const length = daysInMonth(year, monthIndex);
  const cells: (IsoDate | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= length; day += 1)
    cells.push(localIso(localDate(year, monthIndex, day)));
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, row) =>
    cells.slice(row * 7, row * 7 + 7),
  );
}

/** The days a picker lets the Member choose, both ends included. */
export type DateRange = { min: IsoDate; max: IsoDate };

/** Just the months from `range.min` through `range.max`. */
function monthsBetween(range: DateRange): CalendarMonth[] {
  const start = fromIso(range.min);
  const months: CalendarMonth[] = [];
  for (let offset = 0; ; offset += 1) {
    const first = localDate(start.getFullYear(), start.getMonth() + offset, 1);
    const key = monthKey(localIso(first));
    if (key > monthKey(range.max)) return months;
    months.push({
      key,
      first,
      weeks: weeksOf(first.getFullYear(), first.getMonth()),
    });
  }
}

/** How far from today's year a value or Usual date may be and still widen the range. */
const MAX_YEARS_AWAY = 10;

/** The month (`YYYY-MM`) of `iso` when it is within `MAX_YEARS_AWAY` years of `today`; otherwise null. */
function nearMonth(today: Date, iso: IsoDate | null | undefined) {
  if (!iso) return null;
  const year = Number(iso.slice(0, 4));
  return Math.abs(year - today.getFullYear()) <= MAX_YEARS_AWAY
    ? monthKey(iso)
    : null;
}

/**
 * The calendar's months: one month before `today` through twelve after, extended to the value's month and the
 * Usual date's month when they are earlier or later, but only within ten years of today. Anything further out
 * (the API takes any year) would render tens of thousands of months, so it doesn't widen the range.
 */
export function calendarMonths(
  today: Date,
  value: IsoDate | null,
  usual: IsoDate | null = null,
  range?: DateRange,
): CalendarMonth[] {
  if (range) return monthsBetween(range);
  const oneBefore = localDate(today.getFullYear(), today.getMonth() - 1, 1);
  const twelveAhead = monthKey(
    localIso(localDate(today.getFullYear(), today.getMonth() + 12, 1)),
  );
  const extras = [nearMonth(today, value), nearMonth(today, usual)].filter(
    (key): key is string => key !== null,
  );
  const earliest = [monthKey(localIso(oneBefore)), ...extras].sort()[0];
  const last = [twelveAhead, ...extras].sort().at(-1)!;
  const start =
    earliest === monthKey(localIso(oneBefore))
      ? oneBefore
      : fromIso(`${earliest}-01`);
  const months: CalendarMonth[] = [];
  for (let offset = 0; ; offset += 1) {
    const first = localDate(start.getFullYear(), start.getMonth() + offset, 1);
    const key = monthKey(localIso(first));
    if (key > last) return months;
    months.push({
      key,
      first,
      weeks: weeksOf(first.getFullYear(), first.getMonth()),
    });
  }
}

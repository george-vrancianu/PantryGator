import { Box } from '@pocket-pantry/ui';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Unit } from '@/lib/catalog';
import { fitChips } from '@/lib/fitChips';
import { haptic, HAPTIC_TICK_MS } from '@/lib/haptic';
import {
  parseTypedNumber,
  usualAmountsAscending,
  usualAmountsInPriority,
  type AmountScale,
} from '@/lib/usualAmounts';
import {
  segmentSx,
  stripSx,
  STRIP_DIVIDER,
} from '@/components/catalog/amountStrip';

export type UsualAmountRowProps = {
  /** The Ingredient's name, for the group's accessible name. */
  name: string;
  /** The Ingredient's Amount Scale; null or left out offers values from the unit alone. */
  scale?: AmountScale | null;
  unit: Unit;
  /** The field's text; the value matching it is pressed. */
  quantity: string;
  /** A value was tapped, with its number in the unit shown. */
  onPick: (value: number) => void;
};

/**
 * The Usual Amount values in the amount field's strip, as edge-to-edge segments with dividers.
 * Values that do not fit the strip are hidden, keeping the one that matches the amount and then
 * the highest-priority ones; the kept ones read smallest to largest and the strip never scrolls.
 * Each segment shows only the number, since the unit sits above it; its accessible name has the unit.
 */
export function UsualAmountRow({
  name,
  scale,
  unit,
  quantity,
  onPick,
}: UsualAmountRowProps) {
  const { t, i18n } = useTranslation('common');
  const group = useRef<HTMLDivElement>(null);
  // Bumped when the strip resizes, so the values are fitted again.
  const [resizes, setResizes] = useState(0);
  // Indexes into `values` (priority order) of the segments that fit.
  const [kept, setKept] = useState<number[]>([]);

  const values = useMemo(
    () => usualAmountsInPriority(unit, scale),
    [unit, scale],
  );
  const current = parseTypedNumber(quantity);
  const pinned = current === null ? -1 : values.indexOf(current);

  useEffect(() => {
    const el = group.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setResizes((n) => n + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Measure every segment at its natural width (all shown, none grown), then keep the ones that fit.
  useLayoutEffect(() => {
    const el = group.current;
    if (!el) return;
    const segments = Array.from(
      el.querySelectorAll<HTMLElement>('[data-value]'),
    );
    const wasHidden = segments.map((segment) => segment.hidden);
    el.dataset.measuring = '';
    segments.forEach((segment) => {
      segment.hidden = false;
    });
    const widths = values.map(() => 0);
    segments.forEach((segment) => {
      widths[Number(segment.dataset.value)] = segment.offsetWidth;
    });
    segments.forEach((segment, index) => {
      segment.hidden = wasHidden[index];
    });
    delete el.dataset.measuring;
    setKept(
      fitChips({
        widths,
        rowWidth: el.clientWidth,
        pinned: pinned >= 0 ? pinned : null,
        gap: STRIP_DIVIDER,
      }),
    );
    // The language is in the deps: a longer number format in another locale needs its own fit.
  }, [values, pinned, resizes, i18n.language]);

  const format = (value: number) =>
    new Intl.NumberFormat(i18n.language).format(value);
  const unitLabel = t(`units.${unit}`);
  const order = usualAmountsAscending(unit, scale).map((value) =>
    values.indexOf(value),
  );

  return (
    <Box
      ref={group}
      role="group"
      aria-label={t('amount.usualAmounts', { name })}
      sx={{
        ...stripSx,
        '&[data-measuring] [data-value]': { flex: 'none' },
      }}
    >
      {order.map((index) => {
        const value = values[index];
        const selected = index === pinned;
        return (
          <Box
            key={index}
            component="button"
            type="button"
            data-value={index}
            hidden={!kept.includes(index)}
            aria-pressed={selected}
            aria-label={t('amount.chip', {
              value: format(value),
              unit: unitLabel,
            })}
            onClick={() => {
              haptic(HAPTIC_TICK_MS);
              onPick(value);
            }}
            sx={segmentSx(selected)}
          >
            {format(value)}
          </Box>
        );
      })}
    </Box>
  );
}

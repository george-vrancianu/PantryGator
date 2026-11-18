import {
  Box,
  tokens,
  bodyFont,
  displayType,
  radius,
  focusRing,
} from '@pocket-pantry/ui';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import {
  daysUntil,
  defaultExpiryDate,
  fromIso,
  fullDate,
  type IsoDate,
} from '@/lib/pantry';

const { color } = tokens;

type PickUnit = 'Day' | 'Week' | 'Month';
type QuickPick = { days: number; amount: number; unit: PickUnit; usual?: true };

/** 3 d, 5 d, 1 wk, 2 wk, 1 mo. A month is always 30 days. */
const QUICK: QuickPick[] = [
  { days: 3, amount: 3, unit: 'Day' },
  { days: 5, amount: 5, unit: 'Day' },
  { days: 7, amount: 1, unit: 'Week' },
  { days: 14, amount: 2, unit: 'Week' },
  { days: 30, amount: 1, unit: 'Month' },
];

export type QuickPicksProps = {
  /** The tiles' group, so the sheet can focus a tile when it opens. */
  ref?: Ref<HTMLDivElement>;
  value: IsoDate | null;
  /** The Default Expiry in days; null hides the Usual tile. */
  usualDays: number | null;
  today: Date;
  /** A tile was tapped, with the date it lands on. */
  onPick: (iso: IsoDate) => void;
};

/**
 * The quick-pick tiles: Usual (when there is a Default Expiry), then 3 d to 1 mo. Each shows the date it lands
 * on and is pressed when the value is exactly that many days away. When Usual and a fixed tile share a day
 * count, only Usual is pressed.
 */
export function QuickPicks({
  ref,
  value,
  usualDays,
  today,
  onPick,
}: QuickPicksProps) {
  const { t, i18n } = useTranslation('pantry');
  const days = value === null ? null : daysUntil(value, today);
  const picks: QuickPick[] =
    usualDays === null
      ? QUICK
      : [
          { days: usualDays, amount: usualDays, unit: 'Day', usual: true },
          ...QUICK,
        ];
  const usualPressed = usualDays !== null && days === usualDays;
  const short = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
  });
  const muted = {
    color: color.muted,
    '[aria-pressed="true"] &': { color: 'inherit', opacity: 0.8 },
  };

  return (
    <Box
      ref={ref}
      role="group"
      aria-label={t('picker.quickPicks')}
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 1,
        mb: 1.5,
        '& .tile': {
          position: 'relative',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1px',
          p: '8px 6px 7px',
          font: 'inherit',
          color: color.ink,
          backgroundColor: color.surface,
          border: `1.5px solid ${color.line}`,
          borderRadius: radius.control,
          cursor: 'pointer',
          transition:
            'background-color .12s, border-color .12s, transform .08s',
          '&:active': { transform: 'scale(.97)' },
          ...focusRing,
          '@media (prefers-reduced-motion: reduce)': {
            transition: 'none',
            '&:active': { transform: 'none' },
          },
        },
        '& .tile[aria-pressed="true"]': {
          backgroundColor: color.accentTint,
          borderColor: 'transparent',
          color: color.accentOnTint,
        },
        '& .tile[data-usual]::before': {
          content: '""',
          position: 'absolute',
          top: 7,
          right: 7,
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: color.butter,
        },
        '& .tile[data-usual][aria-pressed="true"]::before': {
          backgroundColor: 'currentColor',
        },
      }}
    >
      {picks.map((pick) => {
        const iso = defaultExpiryDate(pick.days, today);
        // The tile shows the abbreviation; its name spells the amount out in full words.
        const unit = t(`picker.unit${pick.unit}`, { count: pick.amount });
        const amount = t(`picker.amount${pick.unit}`, { count: pick.amount });
        const date = fullDate(iso, today, i18n.language, 'long');
        const landsOn = short.format(fromIso(iso));
        const pressed = pick.usual
          ? usualPressed
          : !usualPressed && days === pick.days;
        return (
          <button
            key={pick.usual ? 'usual' : pick.days}
            type="button"
            className="tile"
            data-usual={pick.usual ? '' : undefined}
            aria-pressed={pressed}
            aria-label={t(pick.usual ? 'picker.usualTile' : 'picker.tile', {
              amount,
              date,
            })}
            onClick={() => onPick(iso)}
          >
            <Box
              component="b"
              sx={{
                ...displayType,
                fontSize: 20,
                lineHeight: 1.05,
              }}
            >
              {pick.amount}
              <Box
                component="small"
                sx={{
                  ml: '2px',
                  fontFamily: bodyFont,
                  fontSize: 12,
                  fontWeight: 600,
                  ...muted,
                }}
              >
                {unit}
              </Box>
            </Box>
            <Box
              component="span"
              sx={{
                fontSize: 11.5,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
                ...muted,
              }}
            >
              {pick.usual ? t('picker.usualDate', { date: landsOn }) : landsOn}
            </Box>
          </button>
        );
      })}
    </Box>
  );
}

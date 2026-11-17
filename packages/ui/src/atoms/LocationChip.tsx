import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { focusRingStyle } from '../theme/focusRing';
import { bodyFont, color, radius, shadow } from '../theme/themeVars';

export type LocationChipProps = {
  label: string;
  /** A live count after the label; omit to show the label alone. */
  count?: number;
  selected: boolean;
  onClick: () => void;
};

/** A Location or filter chip (Canopy handoff section 5): 34 high inside a 44 target, square-cornered; selected is an ink fill with card-coloured text. */
export function LocationChip({
  label,
  count,
  selected,
  onClick,
}: LocationChipProps) {
  return (
    <ButtonBase
      disableRipple
      aria-pressed={selected}
      aria-label={count === undefined ? undefined : `${label} · ${count}`}
      onClick={onClick}
      sx={[
        {
          height: 44,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          fontFamily: bodyFont,
        },
        // The ring goes on the 34 high face, not the 44 target: a scrolling row clips the target's outer ring.
        {
          '&.Mui-focusVisible > span, &:focus-visible > span': focusRingStyle,
        },
      ]}
    >
      <Box
        component="span"
        sx={{
          height: 34,
          boxSizing: 'border-box',
          px: '11px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          borderRadius: radius.chip,
          fontSize: 13,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          borderWidth: '1px',
          borderStyle: 'solid',
          ...(selected
            ? {
                backgroundColor: 'text.primary',
                borderColor: 'text.primary',
                color: color.cardBg,
                boxShadow: shadow.chipOn,
              }
            : {
                backgroundColor: color.cardBg,
                borderColor: color.cardLine,
                color: 'text.primary',
              }),
        }}
      >
        {label}
        {count === undefined ? null : (
          <Box
            component="span"
            sx={{
              fontSize: 12,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              opacity: selected ? 0.78 : 0.7,
            }}
          >
            {count}
          </Box>
        )}
      </Box>
    </ButtonBase>
  );
}

import ButtonBase, { type ButtonBaseProps } from '@mui/material/ButtonBase';
import { focusRing } from '../theme/focusRing';
import { control, radius, shadow, themePalette } from '../theme/themeVars';

export type ToggleProps = Omit<
  ButtonBaseProps,
  'onChange' | 'role' | 'children' | 'value'
> & {
  checked: boolean;
  /** Called with the state the Member asked for. */
  onChange: (checked: boolean) => void;
};

/** An on/off switch (Canopy handoff 5): a 48 x 28 `well-bg` track (radius 7, inset `shadow-well`) turning to the `btn-bg` gradient, with a 22 square `card-bg` knob (radius `r-box`). */
export function Toggle({ checked, onChange, sx, ...props }: ToggleProps) {
  return (
    <ButtonBase
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      sx={[
        (theme) => ({
          position: 'relative',
          flex: '0 0 auto',
          width: 48,
          height: 28,
          borderRadius: radius.track,
          ...(checked
            ? { backgroundImage: control.btnBg }
            : { backgroundColor: control.wellBg, boxShadow: shadow.recess }),
          // Handoff: touch targets are 44pt or more.
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: '-8px 0',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            top: 3,
            left: 3,
            width: 22,
            height: 22,
            borderRadius: radius.box,
            backgroundColor: themePalette(theme).pp.cardBg,
            boxShadow: shadow.card,
            transform: checked ? 'translateX(20px)' : 'none',
            transition: 'transform 150ms',
          },
          '&.Mui-disabled': { opacity: 0.45 },
        }),
        focusRing,
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    />
  );
}

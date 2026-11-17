import ButtonBase, { type ButtonBaseProps } from '@mui/material/ButtonBase';
import type { Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { focusRing } from '../theme/focusRing';
import { PlusIcon } from './icons';
import {
  bodyFont,
  border,
  control,
  nestedRadius,
  radius,
  shadow,
  themePalette,
} from '../theme/themeVars';

export type ButtonVariant =
  'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger';

export type ButtonProps = Omit<ButtonBaseProps, 'color'> & {
  /**
   * `primary` is the Theme primary, `secondary` a bordered surface, `tonal`
   * the accent tint, `ghost` accent text, `danger` the urgent pair.
   */
  variant?: ButtonVariant;
  /** `sm` is 36 high (a primary one 44, the touch target) for tight rows. */
  size?: 'md' | 'sm';
  /** `pill` is fully round, e.g. Done or Move N to Pantry. */
  shape?: 'default' | 'pill';
  /** Icon before the label. */
  startIcon?: ReactNode;
  fullWidth?: boolean;
  /** Renders a link through the theme's LinkComponent (the router link). */
  href?: string;
};

/** Handoff 5: a primary button is 52 high (44 small), a secondary one 44; the rest keep 46 (36). */
function metrics(variant: ButtonVariant, small: boolean) {
  if (variant === 'primary') {
    return small
      ? { height: 44, px: '16px', fontSize: 14, radius: radius.control }
      : { height: 52, px: '18px', fontSize: 15.5, radius: radius.btn };
  }
  if (variant === 'secondary' && !small) {
    return { height: 44, px: '18px', fontSize: 14, radius: radius.control };
  }
  return small
    ? {
        height: 36,
        px: '14px',
        fontSize: 13.5,
        radius: nestedRadius(radius.control, 2),
      }
    : { height: 46, px: '18px', fontSize: 14.5, radius: radius.control };
}

/** `pill` is fully round, whatever the size. */
const corner = (shape: 'default' | 'pill', round: string) =>
  shape === 'pill' ? radius.pill : round;

function variantSx(variant: ButtonVariant) {
  return (theme: Theme) => {
    const p = themePalette(theme);
    switch (variant) {
      case 'primary':
        // The green gradient with its dark 1px line (no flat fallback: `btn-bg` is in every Theme).
        return {
          backgroundImage: control.btnBg,
          borderColor: control.btnLine,
          color: p.primary.contrastText,
          boxShadow: shadow.button,
          '&:hover': { filter: 'brightness(.94)' },
        };
      case 'secondary':
        return {
          backgroundColor: p.background.paper,
          borderColor: p.pp.lineStrong,
          color: p.text.primary,
          '&:hover': { backgroundColor: p.pp.subtle },
        };
      case 'tonal':
        return { backgroundColor: p.pp.accentTint, color: p.pp.accentOnTint };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          color: p.pp.accent,
          '&:hover': {
            backgroundColor: p.pp.accentTint,
            color: p.pp.accentOnTint,
          },
        };
      case 'danger':
        return { backgroundColor: p.error.light, color: p.error.main };
    }
  };
}

/** Press feedback, left out under reduce-motion. */
const press = {
  '@media (prefers-reduced-motion: no-preference)': {
    transition: 'transform 80ms, filter 120ms, background-color 120ms',
    '&:active': { transform: 'scale(.97)' },
  },
} as const;

const base = {
  gap: '8px',
  borderWidth: border.width,
  borderStyle: 'solid',
  borderColor: 'transparent',
  fontFamily: bodyFont,
  fontWeight: 700,
  whiteSpace: 'nowrap',
  '& svg': { flexShrink: 0 },
  '&.Mui-disabled': { opacity: 0.45, cursor: 'not-allowed' },
} as const;

/** The app's button, in the active Theme's colours and shapes. */
export function Button({
  variant = 'primary',
  size = 'md',
  shape = 'default',
  startIcon,
  fullWidth,
  children,
  sx,
  ...props
}: ButtonProps) {
  const m = metrics(variant, size === 'sm');
  return (
    <ButtonBase
      disableRipple
      sx={[
        base,
        {
          height: m.height,
          px: m.px,
          fontSize: m.fontSize,
          width: fullWidth ? '100%' : undefined,
          borderRadius: corner(shape, m.radius),
        },
        variantSx(variant),
        press,
        focusRing,
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    >
      {startIcon}
      {children}
    </ButtonBase>
  );
}

export type AddButtonProps = Omit<ButtonBaseProps, 'children' | 'color'> & {
  /** Names the action, e.g. "Add items"; the button shows only a plus. */
  'aria-label': string;
};

/** The 52 x 52 Add button: `accent` fill, radius `r-fab`. */
export function AddButton({ sx, ...props }: AddButtonProps) {
  return (
    <ButtonBase
      disableRipple
      sx={[
        (theme) => ({
          flexShrink: 0,
          width: 52,
          height: 52,
          borderRadius: radius.fab,
          backgroundColor: themePalette(theme).pp.accent,
          color: themePalette(theme).pp.accentInk,
          boxShadow: shadow.button,
          '&:hover': { filter: 'brightness(.94)' },
          '&.Mui-disabled': { opacity: 0.45 },
        }),
        press,
        focusRing,
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    >
      <PlusIcon size={24} />
    </ButtonBase>
  );
}

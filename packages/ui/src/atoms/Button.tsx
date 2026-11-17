import ButtonBase, { type ButtonBaseProps } from '@mui/material/ButtonBase';
import type { Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { focusRing } from '../theme/focusRing';
import { PlusIcon } from './icons';
import {
  bodyFont,
  border,
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
  /** `sm` is 36 high for tight rows. */
  size?: 'md' | 'sm';
  /** `pill` is fully round, e.g. Done or Move N to Pantry. */
  shape?: 'default' | 'pill';
  /** Icon before the label. */
  startIcon?: ReactNode;
  fullWidth?: boolean;
  /** Renders a link through the theme's LinkComponent (the router link). */
  href?: string;
};

function variantSx(variant: ButtonVariant) {
  return (theme: Theme) => {
    const p = themePalette(theme);
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: p.primary.main,
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
  const small = size === 'sm';
  return (
    <ButtonBase
      disableRipple
      sx={[
        base,
        {
          height: small ? 36 : 46,
          px: small ? '14px' : '18px',
          fontSize: small ? 13.5 : 14.5,
          width: fullWidth ? '100%' : undefined,
          borderRadius:
            shape === 'pill'
              ? '999px'
              : small
                ? nestedRadius(radius.control, 2)
                : radius.control,
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

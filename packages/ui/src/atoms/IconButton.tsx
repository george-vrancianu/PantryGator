import MuiIconButton from '@mui/material/IconButton';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { canopyChipStyle, canopyKeyStyle } from '../theme/canopyStyles';
import { canopyFocusRingStyle } from '../theme/focusRing';
import {
  canopy,
  color as themeColor,
  palette,
  radius,
  shade,
  shadow,
} from '../theme/themeVars';

export type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'color' | 'children' | 'aria-label'
> & {
  /** Accessible name. Required because the button has no visible text. */
  label: string;
  children: ReactNode;
  /**
   * `surface` is the white circle with a border; `accent` is the filled primary action;
   * `plain` is a bare icon for dense rows; `urgent` is the red destructive action;
   * `urgentOutline` is the quieter destructive action: white with an urgent border;
   * `accentOutline` is the quiet primary action: white with an accent border;
   * `neutral` is a toggle at rest, filled with the chip colour so it stands off a card;
   * `soon` is a pressed toggle in the expiry `soon` pair (Running low);
   * `well` is the sheet's Close: a recessed 6 pt-radius square (Canopy 5);
   * `canopyChip` (Back) and `key` (the gold "+") are the Canopy header's square buttons, radius 8.
   */
  tone?:
    | 'surface'
    | 'accent'
    | 'plain'
    | 'urgent'
    | 'urgentOutline'
    | 'accentOutline'
    | 'neutral'
    | 'soon'
    | 'well'
    | 'canopyChip'
    | 'key';
  /** Width and height in px: 44 for headers, 40 inside dense form rows, 34 inside a pill. */
  size?: 34 | 40 | 44;
  href?: string;
  /** Looks and announces as disabled (`aria-disabled`) but stays focusable and ignores clicks. */
  ariaDisabled?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

/** The circular (44 px by default) icon button used in headers and rows. Renders a link when `href` is set. */
export function IconButton({
  label,
  children,
  tone = 'surface',
  size = 44,
  href,
  ariaDisabled,
  onClick,
  ref,
  ...rest
}: IconButtonProps) {
  const toneStyles = {
    accent: {
      backgroundColor: palette('pp-accent'),
      color: 'pp.accentInk',
      '&:hover': { backgroundColor: shade.accentHover },
    },
    surface: {
      backgroundColor: palette('background-paper'),
      color: palette('text-primary'),
      border: `1px solid ${palette('pp-line')}`,
      '&:hover': { backgroundColor: palette('pp-accentTint') },
    },
    plain: {
      backgroundColor: 'transparent',
      color: palette('text-secondary'),
      '&:hover': { backgroundColor: palette('pp-accentTint') },
    },
    urgent: {
      backgroundColor: palette('error-light'),
      color: palette('error-main'),
      '&:hover': { backgroundColor: shade.urgentHover },
    },
    accentOutline: {
      '&:hover': {
        backgroundColor: palette('pp-accentTint'),
        color: palette('pp-accentOnTint'),
      },
      backgroundColor: palette('background-paper'),
      border: `1px solid ${palette('pp-accent')}`,
      color: palette('pp-accent'),
    },
    neutral: {
      backgroundColor: palette('pp-chip'),
      color: palette('text-primary'),
      '&:hover': { backgroundColor: palette('pp-accentTint') },
    },
    soon: {
      backgroundColor: palette('warning-light'),
      color: palette('warning-main'),
      border: `1px solid ${shade.soonBorder}`,
      '&:hover': { backgroundColor: shade.soonHover },
    },
    urgentOutline: {
      backgroundColor: palette('background-paper'),
      color: palette('error-main'),
      border: `1px solid ${shade.urgentBorder}`,
      '&:hover': { backgroundColor: shade.urgentRow },
    },
    well: {
      backgroundColor: themeColor.fieldBg,
      color: themeColor.ink2,
      boxShadow: shadow.recess,
      '&:hover': { filter: 'brightness(.97)' },
    },
    canopyChip: {
      ...canopyChipStyle,
      '&:hover': { backgroundColor: canopy.chip, filter: 'brightness(1.15)' },
    },
    key: {
      ...canopyKeyStyle,
      '&:hover': { background: canopy.keyBg, filter: 'brightness(1.05)' },
      '& svg': { width: 22, height: 22 },
    },
  }[tone];
  return (
    <MuiIconButton
      {...rest}
      ref={ref}
      aria-label={label}
      aria-disabled={ariaDisabled || undefined}
      {...(href ? { href } : {})}
      onClick={ariaDisabled ? undefined : onClick}
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        ...(tone === 'canopyChip' || tone === 'key'
          ? { borderRadius: radius.btn }
          : tone === 'well'
            ? { borderRadius: radius.control }
            : {}),
        ...toneStyles,
        ...(ariaDisabled ? { opacity: 0.35, cursor: 'default' } : {}),
        '&:focus-visible':
          tone === 'canopyChip' || tone === 'key'
            ? canopyFocusRingStyle
            : {
                outline: `3px solid ${palette('pp-accent')}`,
                outlineOffset: 2,
              },
      }}
    >
      {children}
    </MuiIconButton>
  );
}

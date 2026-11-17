import MuiIconButton from '@mui/material/IconButton';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { canopyChipStyle, canopyKeyStyle } from '../theme/canopyStyles';
import { canopyFocusRingStyle } from '../theme/focusRing';
import { tokens } from '../theme/tokens';
import {
  canopy,
  color as themeColor,
  radius,
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
  const { color } = tokens;
  const toneStyles = {
    accent: {
      backgroundColor: color.accent,
      color: 'pp.accentInk',
      '&:hover': { backgroundColor: color.accentHover },
    },
    surface: {
      backgroundColor: color.surface,
      color: color.ink,
      border: `1px solid ${color.line}`,
      '&:hover': { backgroundColor: color.accentTint },
    },
    plain: {
      backgroundColor: 'transparent',
      color: color.muted,
      '&:hover': { backgroundColor: color.accentTint },
    },
    urgent: {
      backgroundColor: color.urgentBg,
      color: color.urgentFg,
      '&:hover': { backgroundColor: color.urgentHover },
    },
    accentOutline: {
      '&:hover': {
        backgroundColor: color.accentTint,
        color: color.accentOnTint,
      },
      backgroundColor: color.surface,
      border: `1px solid ${color.accent}`,
      color: color.accent,
    },
    neutral: {
      backgroundColor: color.chipNeutral,
      color: color.ink,
      '&:hover': { backgroundColor: color.accentTint },
    },
    soon: {
      backgroundColor: color.soonBg,
      color: color.soonFg,
      border: `1px solid ${color.soonBorder}`,
      '&:hover': { backgroundColor: color.soonHover },
    },
    urgentOutline: {
      backgroundColor: color.surface,
      color: color.urgentFg,
      border: `1px solid ${color.urgentBorder}`,
      '&:hover': { backgroundColor: color.urgentRow },
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
                outline: `3px solid ${color.accent}`,
                outlineOffset: 2,
              },
      }}
    >
      {children}
    </MuiIconButton>
  );
}

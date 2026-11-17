import Box, { type BoxProps } from '@mui/material/Box';
import type { Theme } from '@mui/material/styles';
import { border, radius, shadow, themePalette } from '../theme/themeVars';

export type CardProps = BoxProps & {
  /**
   * Handoff section 4. `default` is the stat card (padding 14 16), `media` a
   * card led by an image (10 10 14), `list` holds rows separated by
   * `divider` (4 16).
   */
  variant?: 'default' | 'media' | 'list';
};

const padding = {
  default: '14px 16px',
  media: '10px 10px 14px',
  list: '4px 16px',
} as const;

/** The card's edge in both Themes: a hairline and the Theme's card shadow. */
const edge = (theme: Theme) => {
  const { pp } = themePalette(theme);
  return {
    backgroundColor: pp.cardBg,
    // Longhands: jsdom drops shorthands that hold `var()`.
    borderTopWidth: border.width,
    borderRightWidth: border.width,
    borderBottomWidth: border.width,
    borderLeftWidth: border.width,
    borderStyle: 'solid',
    borderColor: pp.cardLine,
    borderRadius: radius.card,
    boxShadow: shadow.card,
    transition: 'background-color 200ms, color 200ms, box-shadow 200ms',
  };
};

/** A surface that groups content, in the active Theme's card look. */
export function Card({ variant = 'default', sx, ...props }: CardProps) {
  return (
    <Box
      sx={[
        edge,
        { padding: padding[variant], minWidth: 0 },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    />
  );
}

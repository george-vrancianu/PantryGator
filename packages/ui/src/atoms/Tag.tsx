import Box, { type BoxProps } from '@mui/material/Box';
import type { Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { bodyFont, radius, themePalette } from '../theme/themeVars';

export type TagTone = 'accent' | 'ok' | 'soon' | 'urgent' | 'neutral';

export type TagProps = Omit<BoxProps, 'children'> & {
  /**
   * Handoff section 4: `accent` (Covered, Staple), `ok` (In Pantry), `soon`
   * (On list, expiring soon) and `urgent` (short, expired); `neutral` is a
   * muted chip for something inactive.
   */
  tone: TagTone;
  /** Leading icon, e.g. for an expired item. */
  icon?: ReactNode;
  children: ReactNode;
};

/** A tone's background and text colour from the Theme; for pills that are not a Tag but share its tones. */
export const tagColours = (tone: TagTone) => (theme: Theme) => {
  const p = themePalette(theme);
  const [backgroundColor, color] = {
    accent: [p.pp.accentTint, p.pp.accentOnTint],
    ok: [p.success.light, p.success.main],
    soon: [p.warning.light, p.warning.main],
    urgent: [p.error.light, p.error.main],
    neutral: [p.pp.chip, p.text.secondary],
  }[tone];
  return { backgroundColor, color };
};

/** A small status label: 11/700, 3 px radius, in one of the Theme's colour pairs. */
export function Tag({ tone, icon, children, sx, ...props }: TagProps) {
  return (
    <Box
      component="span"
      sx={[
        {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          px: '8px',
          py: '3px',
          borderRadius: radius.tag,
          fontFamily: bodyFont,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.01em',
          lineHeight: 1.3,
          whiteSpace: 'nowrap',
          '& svg': { flexShrink: 0 },
        },
        tagColours(tone),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    >
      {icon}
      {children}
    </Box>
  );
}

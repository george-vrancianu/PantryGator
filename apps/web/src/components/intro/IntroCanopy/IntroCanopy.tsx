import { Box, canopy, IntroLook, radius, SAFE_TOP } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { CanopyTexture } from '@/components/layout/CanopyTexture/CanopyTexture';

/** How far the sheet's top edge overlaps the Canopy (the board draws 74 under the sheet). */
const UNDER_SHEET = 74;
/** The Canopy's room under its own content, above the sheet's edge. */
const CANOPY_GAP = 18;

/** Keyboard rings default to the page colour, which vanishes on the Canopy: make them its ink. */
const canopyFocus = {
  '&& :focus-visible, && .Mui-focusVisible, && label:has(:focus-visible), && a:focus-visible':
    { outlineColor: canopy.ink },
} as const;

type Props = {
  /** What stands on the Canopy (back link, brand lockup, Gator): its text is the Canopy's ink. */
  top: ReactNode;
  /** The sheet: the screen's working content, in the light look. */
  children: ReactNode;
  /** Width of the sheet's content column. */
  maxWidth?: number;
  /** Space under the sheet's content, e.g. to clear a fixed Dock. */
  bottom?: string;
};

/**
 * The Intro's two-tone frame (Canopy handoff 7.8), shared by Languages, Log in, Sign up, Set up or skip and
 * the Setup steps, as Launch draws it: the Canopy with its texture and the screen's `top` on it, then the
 * sheet rising over it with the content. The Intro is always in the light look, so the sheet is the same in
 * Light and Dark.
 */
export function IntroCanopy(props: Props) {
  return (
    <IntroLook ground="canopy">
      <IntroCanopyFrame {...props} />
    </IntroLook>
  );
}

/** The same frame for a screen that already stands under `IntroLook ground="canopy"` (the Setup Review pages, whose loading states sit outside it). */
export function IntroCanopyFrame({
  top,
  children,
  maxWidth = 520,
  bottom = '40px',
}: Props) {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <Box
        data-region="canopy"
        sx={[
          {
            position: 'relative',
            overflow: 'hidden',
            flex: '0 0 auto',
            background: canopy.bg,
            backgroundColor: canopy.base,
            color: canopy.ink,
            pt: `calc(${SAFE_TOP} + 10px)`,
            pb: `${UNDER_SHEET + CANOPY_GAP}px`,
          },
          canopyFocus,
        ]}
      >
        <CanopyTexture texture="home" />
        <Box
          sx={{
            position: 'relative',
            boxSizing: 'border-box',
            maxWidth,
            mx: 'auto',
            px: '24px',
          }}
        >
          {top}
        </Box>
      </Box>
      <Box
        component="main"
        sx={{
          position: 'relative',
          zIndex: 1,
          flex: '1 0 auto',
          mt: `-${UNDER_SHEET}px`,
          boxSizing: 'border-box',
          background: canopy.sheetBg,
          borderRadius: radius.introSheet,
          boxShadow: canopy.sheetShadow,
          color: 'text.primary',
        }}
      >
        <Box
          sx={{
            boxSizing: 'border-box',
            maxWidth,
            mx: 'auto',
            p: '32px 24px 0',
            pb: bottom,
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}

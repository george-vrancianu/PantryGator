import { Box, tokens } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { RAIL_WIDTH, TOP_BAR_HEIGHT } from '../../lib/scanGuides';
import { glassBar, translucent } from './glass';
import { insetBottom, insetRight, insetTop, FeedBox } from './CameraFrame';

type Props = {
  stack?: ReactNode;
  shutter: ReactNode;
  right?: ReactNode;
  /** The mode list (or whatever stands in for it). */
  slider: ReactNode;
  zoom?: ReactNode;
  /** Messages for the Member: at the bottom of the feed, left of the rail. */
  status?: ReactNode;
};

/**
 * The glass rail down the right edge of a tablet or desktop window in landscape: the photo stack, the
 * zoom pill, the shutter, the mode list (it scrolls when short) and Import, top to bottom, all
 * upright. It starts under the top bar and is `RAIL_WIDTH` wide, the same constant the guide is
 * centred around. Messages sit at the bottom of the feed, never over the rail. Takes the same slots
 * as `CameraFooter`, so the hosts do not care which one they get.
 */
export function CameraRail({
  stack,
  shutter,
  right,
  slider,
  status,
  zoom,
}: Props) {
  return (
    <>
      {status ? (
        <FeedBox
          aboveFooter={0}
          inRail={0}
          margin={0}
          data-testid="scan-status"
          sx={{ px: 2.5, pb: 1, pointerEvents: 'none' }}
        >
          {status}
        </FeedBox>
      ) : null}
      <Box
        data-testid="scan-rail"
        sx={{
          ...glassBar,
          position: 'absolute',
          top: `calc(${insetTop} + ${TOP_BAR_HEIGHT}px)`,
          right: 0,
          bottom: 0,
          width: `calc(${RAIL_WIDTH}px + ${insetRight})`,
          boxSizing: 'border-box',
          borderLeft: `1px solid ${translucent(tokens.color.ink, 6)}`,
          pb: `max(${insetBottom}, 16px)`,
          pt: 2,
          pl: 1.5,
          pr: `calc(${insetRight} + 12px)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
        }}
      >
        {stack ? <Box sx={{ flex: 'none' }}>{stack}</Box> : null}
        {zoom ? <Box sx={{ flex: 'none' }}>{zoom}</Box> : null}
        <Box sx={{ flex: 'none' }}>{shutter}</Box>
        <Box
          sx={{
            flex: '1 1 0',
            minHeight: 0,
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          {slider}
        </Box>
        {right ? <Box sx={{ flex: 'none' }}>{right}</Box> : null}
      </Box>
    </>
  );
}

import { Box, tokens } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { FOOTER_MIN_BOTTOM, SHUTTER_ROW_HEIGHT } from '../../lib/scanGuides';
import { glassBar, translucent } from './glass';
import { insetBottom, insetLeft, insetRight } from './CameraFrame';

type Props = {
  /** The left cell of the shutter row: the photo stack on the Scan page, empty on the add-Batch camera. */
  stack?: ReactNode;
  /** The middle cell: the shutter, or the Barcode ring. */
  shutter: ReactNode;
  /** The right cell: Import where the host has one. */
  right?: ReactNode;
  /** The mode slider (or whatever stands in for it). */
  slider: ReactNode;
  /** The zoom pill, centred just above the bar; nothing where the camera cannot zoom. */
  zoom?: ReactNode;
  /** Messages for the Member (reading, camera trouble, alerts), shown just above the bar so they never cover the guide. */
  status?: ReactNode;
};

/**
 * The glass footer under the camera feed (handoff 5.1): the shutter row (`stack | shutter | right`, as
 * a `1fr auto 1fr` grid so the shutter never moves), then the mode slider, then the bottom safe area
 * (at least `FOOTER_MIN_BOTTOM`).
 * Both camera hosts mount it. Their messages sit right above the bar.
 */
export function CameraFooter({
  stack,
  shutter,
  right,
  slider,
  status,
  zoom,
}: Props) {
  return (
    <Box
      data-testid="scan-footer"
      sx={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
    >
      {zoom ? (
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            // Clear of the status line that sits right above the bar.
            bottom: 'calc(100% + 34px)',
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            '& > *': { pointerEvents: 'auto' },
          }}
        >
          {zoom}
        </Box>
      ) : null}
      {status ? (
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '100%',
            px: 2.5,
            pb: 1,
            pointerEvents: 'none',
          }}
        >
          {status}
        </Box>
      ) : null}
      <Box
        sx={{
          ...glassBar,
          borderTop: `1px solid ${translucent(tokens.color.ink, 6)}`,
          pb: `max(${insetBottom}, ${FOOTER_MIN_BOTTOM}px)`,
          pl: insetLeft,
          pr: insetRight,
        }}
      >
        <Box
          sx={{
            height: SHUTTER_ROW_HEIGHT,
            px: '30px',
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
            {stack}
          </Box>
          {shutter}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            {right}
          </Box>
        </Box>
        {slider}
      </Box>
    </Box>
  );
}

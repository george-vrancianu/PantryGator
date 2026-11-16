import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { CameraIcon, MicIcon } from '../atoms/icons';
import {
  CAPSULE_CAMERA_ONLY_WIDTH,
  CAPSULE_WIDTH,
  DOCK_OVERHANG,
  DOCK_PADDING,
} from '../theme/dock';
import { focusRing } from '../theme/focusRing';
import { usePrefersReducedMotion } from '../theme/usePrefersReducedMotion';
import { dock, radius } from '../theme/themeVars';
import { tokens } from '../theme/tokens';

/** The half of the capsule a teaching Dock lights. */
export type DockTeach = 'camera' | 'mic';

/**
 * The lit half: butter fill, butter-ink icon, and (unless the Member asked for less motion) a ring
 * that spreads out and fades, 1.6 s, forever.
 */
const lit = (pulse: boolean) => ({
  bgcolor: tokens.color.butter,
  color: tokens.color.butterInk,
  ...(pulse
    ? {
        animation: 'pp-dock-pulse 1.6s ease-out infinite',
        '@keyframes pp-dock-pulse': {
          from: {
            boxShadow: `0 0 0 0 color-mix(in srgb, ${tokens.color.butter} 75%, transparent)`,
          },
          to: { boxShadow: `0 0 0 16px transparent` },
        },
      }
    : {}),
});

/** What the dimmed half of a teaching Dock looks like and does: nothing. */
const dimmed = { opacity: 0.4, cursor: 'default' } as const;

export type DockCapsuleProps = {
  cameraLabel: string;
  cameraHref: string;
  /**
   * Give the mic half a place: called with the element the mic control should be rendered into
   * (a portal target). Leave it out for a camera-only capsule.
   */
  micSlot?: (element: HTMLElement | null) => void;
  /**
   * Teaching mode (the Intro): light one half and dim the other. The lit half stays the real control
   * (the camera link, or whatever `micSlot` receives) and gets the butter fill and the pulse ring; the
   * dimmed half is `aria-disabled`, out of the tab order and does nothing. The capsule's ring turns
   * cream, as a ring in the page colour would vanish on the olive ground.
   */
  teach?: DockTeach;
  /**
   * The accessible name of the dimmed mic half while `teach` is `camera` (the capsule then shows a
   * dimmed stand-in instead of the `micSlot` element). Without a `micSlot` there is no mic half.
   */
  micLabel?: string;
  /**
   * Non-blocking teach: light one half (butter fill, pulse ring) and leave everything else as it is.
   * Nothing is dimmed or disabled, the capsule's ring keeps the page colour, and the Dock's tabs stay
   * usable (do not set the Dock's `teaching`). `teach` wins if both are set.
   */
  highlight?: DockTeach;
};

/**
 * The Mic/Camera capsule over the Dock's middle slot: the mic on top, the camera below, a
 * hairline between, overhanging the bar by 18 px at the top and bottom. Without a mic it shrinks
 * to a camera button inside the bar.
 */
export function DockCapsule({
  cameraLabel,
  cameraHref,
  micSlot,
  teach,
  micLabel,
  highlight,
}: DockCapsuleProps) {
  const pulse = !usePrefersReducedMotion();
  const cameraDimmed = teach === 'mic';
  const litHalf = teach ?? highlight;
  const camera = (
    <ButtonBase
      {...(cameraDimmed ? {} : { href: cameraHref })}
      aria-label={cameraLabel}
      aria-disabled={cameraDimmed || undefined}
      tabIndex={cameraDimmed ? -1 : undefined}
      onClick={cameraDimmed ? (event) => event.preventDefault() : undefined}
      sx={[
        {
          flex: 1,
          width: '100%',
          color: 'inherit',
          borderRadius: radius.cap,
        },
        // With a mic above, only the bottom corners are round.
        micSlot
          ? {
              borderRadius: `0 0 ${radius.cap} ${radius.cap}`,
            }
          : {},
        litHalf === 'camera' ? lit(pulse) : {},
        cameraDimmed ? dimmed : {},
        focusRing,
      ]}
    >
      <CameraIcon size={24} />
    </ButtonBase>
  );
  return (
    <Box
      data-dock-capsule=""
      sx={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        top: micSlot ? -DOCK_PADDING - DOCK_OVERHANG : 0,
        bottom: micSlot ? -DOCK_PADDING - DOCK_OVERHANG : 0,
        width: micSlot ? CAPSULE_WIDTH : CAPSULE_CAMERA_ONLY_WIDTH,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: radius.cap,
        background: dock.capBg,
        border: `1px solid ${dock.capLine}`,
        boxSizing: 'border-box',
        color: dock.capInk,
        boxShadow: dock.capShadow,
        '& svg': { strokeWidth: 1.7 },
      }}
    >
      {micSlot ? (
        <>
          {teach === 'camera' ? (
            <ButtonBase
              aria-label={micLabel}
              aria-hidden={micLabel ? undefined : true}
              aria-disabled="true"
              tabIndex={-1}
              onClick={(event) => event.preventDefault()}
              sx={[
                { flex: 1, borderRadius: `${radius.cap} ${radius.cap} 0 0` },
                dimmed,
              ]}
            >
              <MicIcon size={24} />
            </ButtonBase>
          ) : (
            <Box
              ref={micSlot}
              sx={[
                {
                  flex: 1,
                  display: 'flex',
                  position: 'relative',
                  borderRadius: `${radius.cap} ${radius.cap} 0 0`,
                },
                litHalf === 'mic' ? lit(pulse) : {},
              ]}
            />
          )}
          <Box
            aria-hidden
            sx={{
              height: '1px',
              mx: '13px',
              bgcolor: dock.capDivider,
            }}
          />
        </>
      ) : null}
      {camera}
    </Box>
  );
}

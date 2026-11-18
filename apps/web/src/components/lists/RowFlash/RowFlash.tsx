import { Box, usePrefersReducedMotion, palette } from '@pocket-pantry/ui';
import { useRowFlash } from '@/lib/rowFlash';

/**
 * A one-off accent tint that fades over 1.8 s on a row a Voice Note just changed. Nothing at all under
 * reduced motion.
 *
 * The tint sits BEHIND the row's content (`zIndex: -1`) so the name, tick and amount stay readable. For that to
 * show, the host must be a stacking context of its own (`flashHost`: positioned plus `isolation: isolate`): a
 * negative z-index then lands above the host's own (transparent) background and the opaque swipe surface
 * underneath it, but below the host's in-flow content.
 */
export const flashHost = {
  position: 'relative',
  isolation: 'isolate',
} as const;

export function RowFlash({ ids }: { ids: readonly string[] }) {
  const flashing = useRowFlash(ids);
  const reduceMotion = usePrefersReducedMotion();
  if (!flashing || reduceMotion) return null;
  return (
    <Box
      aria-hidden
      data-row-flash=""
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: -1,
        pointerEvents: 'none',
        backgroundColor: palette('pp-accentTint'),
        animation: 'pp-row-flash 1.8s ease-out forwards',
        '@keyframes pp-row-flash': {
          '0%, 30%': { opacity: 1 },
          '100%': { opacity: 0 },
        },
      }}
    />
  );
}

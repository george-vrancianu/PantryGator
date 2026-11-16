import Box from '@mui/material/Box';
import { useEffect, useState } from 'react';
import { visuallyHidden } from '../theme/visuallyHidden';
import { color, palette, shadow } from '../theme/themeVars';
import { usePrefersReducedMotion } from '../theme/usePrefersReducedMotion';

export type RefreshLoaderProps = {
  state: 'idle' | 'busy' | 'done' | 'failed';
  /** What the screen reader hears; nothing is shown in words. */
  labels: { busy: string; done: string; failed: string };
  /**
   * `viewport` (default) drops from the top of the screen, below the top inset. `sheet` drops from the top
   * of the nearest positioned ancestor (the working sheet, which clips it), so it comes out from under the
   * Canopy and lands on the sheet.
   */
  anchor?: 'viewport' | 'sheet';
};

/** How long the disc takes to tuck back up; the mark's re-entrance waits for it. */
export const REFRESH_LOADER_RETRACT_MS = 380;
/** How long a failure shows (warning mark, shake) before the disc tucks away. */
export const REFRESH_LOADER_FAILED_MS = 1100;

/**
 * The screen refresh as a round disc that drops from the top of the app with a spinning accent arc,
 * then tucks back up. It carries no words: a visually hidden polite live region announces them.
 */
export function RefreshLoader({
  state,
  labels,
  anchor = 'viewport',
}: RefreshLoaderProps) {
  const reduceMotion = usePrefersReducedMotion();
  // A failure shows briefly, then the disc tucks away like a success; the words stay with the state.
  const [failedShown, setFailedShown] = useState(state === 'failed');
  const [previous, setPrevious] = useState(state);
  if (state !== previous) {
    setPrevious(state);
    setFailedShown(state === 'failed');
  }
  useEffect(() => {
    if (state !== 'failed') return;
    const timer = setTimeout(
      () => setFailedShown(false),
      REFRESH_LOADER_FAILED_MS,
    );
    return () => clearTimeout(timer);
  }, [state]);
  const failed = state === 'failed' && failedShown;
  const down = state === 'busy' || failed;
  return (
    <>
      <Box role="status" sx={visuallyHidden}>
        {state === 'idle' ? '' : labels[state]}
      </Box>
      <Box
        aria-hidden
        data-testid="refresh-loader"
        data-shown={down}
        sx={{
          position: anchor === 'sheet' ? 'absolute' : 'fixed',
          top: 0,
          left: '50%',
          // Above the page and the raised Dock, below sheets and dialogs (MUI modal 1300).
          zIndex: 1250,
          pointerEvents: 'none',
          transform: down
            ? 'translate(-50%, 0)'
            : 'translate(-50%, calc(-100% - 24px))',
          visibility: down ? 'visible' : 'hidden',
          transition: reduceMotion
            ? 'none'
            : down
              ? 'transform 420ms cubic-bezier(.34,1.56,.64,1)'
              : `transform ${REFRESH_LOADER_RETRACT_MS}ms cubic-bezier(.5,0,.75,0), visibility 0s ${REFRESH_LOADER_RETRACT_MS}ms`,
        }}
      >
        <Box
          sx={{
            mt:
              anchor === 'sheet'
                ? '14px'
                : 'calc(env(safe-area-inset-top, 0px) + 14px)',
            width: 44,
            height: 44,
            borderRadius: '50%',
            bgcolor: color.cardBg,
            boxShadow: shadow.float,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            '@keyframes pp-refresh-shake': {
              '0%,100%': { transform: 'none' },
              '20%,60%': { transform: 'translateX(-6px)' },
              '40%,80%': { transform: 'translateX(6px)' },
            },
            animation:
              failed && !reduceMotion
                ? 'pp-refresh-shake 420ms ease-in-out'
                : 'none',
          }}
        >
          {failed ? (
            <Box
              sx={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                bgcolor: palette('warning-main'),
                color: 'background.paper',
                fontWeight: 800,
                fontSize: 14,
                lineHeight: '20px',
                textAlign: 'center',
              }}
            >
              !
            </Box>
          ) : reduceMotion ? (
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: palette('pp-accent'),
              }}
            />
          ) : (
            <Box
              sx={{
                width: 22,
                height: 22,
                boxSizing: 'border-box',
                borderRadius: '50%',
                border: `3px solid ${color.lineStrong}`,
                borderTopColor: palette('pp-accent'),
                borderRightColor: palette('pp-accent'),
                '@keyframes pp-refresh-spin': {
                  to: { transform: 'rotate(360deg)' },
                },
                animation: 'pp-refresh-spin 700ms linear infinite',
              }}
            />
          )}
        </Box>
      </Box>
    </>
  );
}

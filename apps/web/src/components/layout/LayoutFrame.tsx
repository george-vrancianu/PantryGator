import {
  Box,
  canopy,
  DOCK_CLEARANCE,
  gutterLeft,
  gutterRight,
  palette,
  SAFE_TOP,
  usePrefersReducedMotion,
} from '@pocket-pantry/ui';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { haptic } from '../../lib/haptic';
import { layoutKindFor } from '../../lib/layoutKind';
import { useRefreshScreen } from '../../lib/refresh';
import { ScrollerProvider } from '../../lib/scroller';
import { RefreshDimmed } from '../RefreshDimmed';
import { RefreshLoaderSlot } from '../RefreshLoaderSlot';
import {
  LayoutSlotsContext,
  PageInstanceContext,
  type LayoutRegion,
  type PageInstance,
  type PagePhase,
} from './layoutContext';
import { CanopyTexture } from './CanopyTexture';
import { FADE_MS, HEIGHT_EASING, TRANSITION_MS } from './timing';
import { usePageTransition, type Page } from './usePageTransition';
import { usePullToRefresh } from './usePullToRefresh';
import { useBubbleTopBound } from './useBubbleTopBound';
import { useSheetScroll } from './useSheetScroll';

const gutters = {
  pl: { xs: gutterLeft(16), md: gutterLeft(48) },
  pr: { xs: gutterRight(16), md: gutterRight(48) },
};

/** The Canopy runs this far under the sheet, so its green shows behind the sheet's rounded corners. */
const CANOPY_UNDER_SHEET = 40;
/** Room between the last header element and the sheet's top edge. */
const CANOPY_TO_SHEET = 24;
/** The sheet's top room, above the first block. */
const SHEET_TOP_PADDING = 18;
/** The gradient pinned to the bottom of the screen under the Dock. */
const SHEET_FADE_HEIGHT = 170;

type Props = {
  /** `useOutlet()`: the matched page. */
  outlet: ReactNode;
  /** Whether the Dock is shown, which the sheet's bottom padding clears. */
  withDock: boolean;
  dockClearance?: string | { xs: string; md: string };
  wide: boolean;
};

/**
 * The shared layout: a top bar, a header and the content sheet, in one column as tall as the
 * screen (`100dvh`). The window never scrolls; the sheet is the only scroller. Pages put their top
 * bar and header into the first two through `Screen`; their content renders in the sheet.
 *
 * Moving to another path holds the outgoing page for `TRANSITION_MS`, so both exist at once: the top
 * bar and header cross-fade, their regions animate to the new page's measured height, and the
 * content fades out then in. Reduced motion, and the camera, swap instantly.
 */
export function LayoutFrame({ outlet, withDock, dockClearance, wide }: Props) {
  const { pathname } = useLocation();
  const kind = layoutKindFor(pathname);
  const reduced = usePrefersReducedMotion();
  const { run } = useRefreshScreen();

  const canHold = useCallback(
    (from: string, to: string) =>
      !reduced &&
      layoutKindFor(from) !== 'camera' &&
      layoutKindFor(to) !== 'camera',
    [reduced],
  );
  const { current, leaving } = usePageTransition(outlet, pathname, canHold);
  const transitioning = leaving !== null;

  const [topBarEl, setTopBarEl] = useState<HTMLElement | null>(null);
  const [headerEl, setHeaderEl] = useState<HTMLElement | null>(null);
  useBubbleTopBound(kind === 'camera' ? null : headerEl, topBarEl);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [heights, setHeights] = useState({ topBar: 0, header: 0 });
  const setHeight = useCallback((region: LayoutRegion, height: number) => {
    setHeights((h) => (h[region] === height ? h : { ...h, [region]: height }));
  }, []);

  // The sheet jumps to the new page's position on the swap, so the page leaving is moved by the
  // difference to stay where the Member last saw it while it fades.
  const [leavingOffset, setLeavingOffset] = useState(0);
  useSheetScroll(scroller, (from, to) => setLeavingOffset(to - from));
  usePullToRefresh(scroller, {
    enabled: kind === 'page',
    onRefresh: () => {
      haptic(10);
      void run();
    },
  });

  const slots = useMemo(
    () => ({
      topBarEl,
      headerEl,
      setHeight,
      kind,
      wide,
      collapsed: false,
    }),
    [topBarEl, headerEl, setHeight, kind, wide],
  );

  if (kind === 'camera') return <>{outlet}</>;

  const regionSx = (animate: boolean) => ({
    position: 'relative' as const,
    transition: animate ? `height ${TRANSITION_MS}ms ${HEIGHT_EASING}` : 'none',
    overflow: animate ? 'hidden' : undefined,
  });

  const pages: Array<{ page: Page; phase: PagePhase }> = [
    ...(leaving ? [{ page: leaving, phase: 'leaving' as const }] : []),
    { page: current, phase: transitioning ? 'entering' : 'idle' },
  ];

  return (
    <LayoutSlotsContext value={slots}>
      <Box
        data-testid="app-layout"
        data-collapsed={slots.collapsed}
        sx={{
          height: '100vh',
          '@supports (height: 100dvh)': { height: '100dvh' },
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxSizing: 'border-box',
          backgroundColor: palette('background-default'),
          color: palette('text-primary'),
        }}
      >
        <Box
          data-region="canopy"
          sx={{
            flexShrink: 0,
            position: 'relative',
            zIndex: 0,
            background: canopy.bg,
            // Solid fallback where the gradient is not painted.
            backgroundColor: 'var(--pp-canopy-base)',
            color: canopy.ink,
            pb: `${CANOPY_TO_SHEET + CANOPY_UNDER_SHEET}px`,
            // The header content sits above the texture.
            '& > [data-region]': { position: 'relative' },
            overflow: 'hidden',
          }}
        >
          <CanopyTexture />
          <Box
            data-region="top-bar"
            sx={{
              pt: `calc(${SAFE_TOP} + 6px)`,
              ...gutters,
            }}
          >
            <Box
              ref={setTopBarEl}
              sx={{ ...regionSx(transitioning), height: heights.topBar }}
            />
          </Box>
          <Box data-region="header" sx={gutters}>
            <Box
              ref={setHeaderEl}
              sx={{ ...regionSx(transitioning), height: heights.header }}
            />
          </Box>
        </Box>
        <Box
          data-region="sheet"
          sx={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            mt: `-${CANOPY_UNDER_SHEET}px`,
            background: canopy.sheetBg,
            borderRadius: `${canopy.sheetRadius} ${canopy.sheetRadius} 0 0`,
            boxShadow: canopy.sheetShadow,
          }}
        >
          <ScrollerProvider element={scroller}>
            <Box
              ref={setScroller}
              data-testid="sheet-scroller"
              sx={{
                height: '100%',
                overflowY: 'auto',
                overflowX: 'hidden',
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <RefreshDimmed>
                {/* Sticky elements inside stick at the top of this scroller. */}
                <Box
                  component="main"
                  sx={{
                    boxSizing: 'border-box',
                    ...gutters,
                    pt: `${SHEET_TOP_PADDING}px`,
                    pb: withDock ? (dockClearance ?? DOCK_CLEARANCE) : '24px',
                  }}
                >
                  <Box
                    sx={{
                      position: 'relative',
                      maxWidth: wide ? 1180 : 960,
                      mx: 'auto',
                      '@keyframes pp-sheet-fade-in': {
                        from: { opacity: 0 },
                        to: { opacity: 1 },
                      },
                      '@keyframes pp-sheet-fade-out': {
                        from: { opacity: 1 },
                        to: { opacity: 0 },
                      },
                      '& > [data-phase="leaving"]': {
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        pointerEvents: 'none',
                        animation: `pp-sheet-fade-out ${FADE_MS.content}ms linear both`,
                      },
                      '& > [data-phase="entering"]': {
                        animation: `pp-sheet-fade-in ${FADE_MS.content}ms linear ${TRANSITION_MS - FADE_MS.content}ms both`,
                      },
                    }}
                  >
                    {pages.map(({ page, phase }) => (
                      <PageHost
                        key={page.id}
                        id={page.id}
                        phase={phase}
                        offset={phase === 'leaving' ? leavingOffset : 0}
                      >
                        {page.element}
                      </PageHost>
                    ))}
                  </Box>
                </Box>
              </RefreshDimmed>
            </Box>
          </ScrollerProvider>
          <RefreshLoaderSlot anchor="sheet" />
        </Box>
        <Box
          data-testid="sheet-fade"
          aria-hidden
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            height: `${SHEET_FADE_HEIGHT}px`,
            // Under the Dock (10), over the sheet.
            zIndex: 2,
            pointerEvents: 'none',
            background: canopy.sheetFade,
          }}
        />
      </Box>
    </LayoutSlotsContext>
  );
}

/** One page of the transition: its content, and the phase its `Screen` parts read. */
function PageHost({
  id,
  phase,
  offset,
  children,
}: {
  id: number;
  phase: PagePhase;
  /** How far down the page is moved, in px: the leaving page keeps its place while the sheet jumps. */
  offset: number;
  children: ReactNode;
}) {
  const instance = useMemo<PageInstance>(() => ({ id, phase }), [id, phase]);
  return (
    <PageInstanceContext value={instance}>
      <Box
        data-phase={phase === 'idle' ? undefined : phase}
        aria-hidden={phase === 'leaving' ? true : undefined}
        inert={phase === 'leaving'}
        style={offset ? { top: offset } : undefined}
      >
        {children}
      </Box>
    </PageInstanceContext>
  );
}

import Box from '@mui/material/Box';
import type { ScreenHeaderAction, ScreenHeaderProps } from '@pocket-pantry/ui';
import { useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AppScreenHeader } from '../AppScreenHeader';
import {
  usePageInstance,
  useLayoutSlots,
  type LayoutRegion,
} from './layoutContext';
import { FADE_MS } from './timing';

export type ScreenProps = {
  /** The page title, an H1 in the top bar. */
  title?: string;
  /** The muted status line under the title. */
  status?: string;
  /** Back on the left of sub-screens. */
  back?: ScreenHeaderProps['back'];
  /** The secondary action, before the primary key. */
  secondary?: ReactNode;
  /** The primary key (the gold `+`). */
  primary?: ScreenHeaderAction;
  /** The page's own block under the top bar (Pantry's search, Shopping's progress). Editors and Scan Review have none. */
  header?: ReactNode;
  /** The Canopy texture behind the top bar and header. Reserved: the Canopy look is not built yet. */
  texture?: string;
  /** Keep the title to one line with an ellipsis. */
  truncateTitle?: boolean;
  titleRef?: ScreenHeaderProps['titleRef'];
  /** The content, which scrolls in the sheet. */
  children?: ReactNode;
};

/**
 * What every page inside `AppLayout` renders: its top bar and header go into the layout's slots
 * through portals, and `children` stay where the page is, in the working sheet. The page keeps its own
 * state (the search query, say). Outside the layout (a page rendered alone) it draws the same parts
 * in one column.
 */
export function Screen({
  title,
  status,
  back,
  secondary,
  primary,
  header,
  texture,
  truncateTitle,
  titleRef,
  children,
}: ScreenProps) {
  const slots = useLayoutSlots();
  const instance = usePageInstance();
  const markScreen = instance?.markScreen;
  useLayoutEffect(() => markScreen?.(), [markScreen]);

  const topBar = (
    <AppScreenHeader
      title={title}
      subtitle={status}
      back={back}
      trailing={secondary}
      action={primary}
      truncateTitle={truncateTitle}
      titleRef={titleRef}
    />
  );

  if (!slots || !instance) {
    return (
      <>
        {topBar}
        {header}
        {children}
      </>
    );
  }
  return (
    <>
      <Slot region="topBar" texture={texture}>
        {topBar}
      </Slot>
      {slots.kind === 'editor' ? (
        <Slot region="header">{null}</Slot>
      ) : (
        <Slot region="header" texture={texture}>
          {header}
        </Slot>
      )}
      {children}
    </>
  );
}

/**
 * A region's part of a page: portalled into the layout's region, faded with the page's phase, and
 * measured so the region can animate to its height. Nothing to show reports a height of 0.
 */
function Slot({
  region,
  texture,
  children,
}: {
  region: LayoutRegion;
  texture?: string;
  children: ReactNode;
}) {
  const slots = useLayoutSlots()!;
  const instance = usePageInstance()!;
  const target = region === 'topBar' ? slots.topBarEl : slots.headerEl;
  const empty = children === null || children === undefined;
  const { phase } = instance;
  const { setHeight } = slots;

  useLayoutEffect(() => {
    if (phase === 'leaving') return;
    if (empty || !target) {
      // The new page has nothing here: the region closes (a leaving page never reports).
      if (empty) setHeight(region, 0);
      return;
    }
    const el = target.querySelector<HTMLElement>(
      `[data-slot="${region}"][data-instance="${instance.id}"]`,
    );
    if (!el) return;
    const report = () => setHeight(region, el.offsetHeight);
    report();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [empty, target, phase, region, setHeight, instance]);

  if (empty || !target) return null;
  return createPortal(
    <Box
      data-slot={region}
      data-instance={instance.id}
      data-texture={texture}
      data-phase={phase === 'idle' ? undefined : phase}
      aria-hidden={phase === 'leaving' ? true : undefined}
      inert={phase === 'leaving'}
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        maxWidth: slots.wide ? 1180 : 960,
        mx: 'auto',
        '@keyframes pp-layout-fade-in': {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        '@keyframes pp-layout-fade-out': {
          from: { opacity: 1 },
          to: { opacity: 0 },
        },
        '&[data-phase="entering"]': {
          animation: `pp-layout-fade-in ${FADE_MS.crossfade}ms linear both`,
        },
        '&[data-phase="leaving"]': {
          animation: `pp-layout-fade-out ${FADE_MS.crossfade}ms linear both`,
          pointerEvents: 'none',
        },
      }}
    >
      {children}
    </Box>,
    target,
  );
}

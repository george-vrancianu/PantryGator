import MuiPopper, {
  type PopperProps as MuiPopperProps,
} from '@mui/material/Popper';
import type { ReactNode, Ref } from 'react';

export type PopperProps = {
  open: boolean;
  anchorEl: HTMLElement | null;
  placement?: MuiPopperProps['placement'];
  children: ReactNode;
  /**
   * Keeps a tall popup on screen: it opens on the side with more room (see `pickSide`) and its height is capped to the room on that side, so it scrolls
   * inside instead of running off the viewport. `inset` is the gap kept to the viewport edge, in
   * px (default 8); pass a larger bottom gap to clear the Dock. Off by default.
   */
  contain?: boolean | { inset?: number };
  /** The popper's own element, for outside-tap checks. */
  ref?: Ref<HTMLDivElement>;
};

/**
 * The height a popup can take on the side it sits: above the anchor for a `top` placement, below it
 * otherwise, less the gap kept to the viewport edge.
 */
export function roomOnSide(
  placement: string,
  anchor: { top: number; bottom: number },
  viewportHeight: number,
  inset: number,
) {
  const room = placement.startsWith('top')
    ? anchor.top - inset
    : viewportHeight - anchor.bottom - inset;
  return Math.max(0, room);
}

/** The least height a contained popup keeps when neither side has room for it. */
const MIN_POPUP_HEIGHT = 120;
/** A popup opens below the anchor if at least this much (or all of its content, if shorter) fits there. */
const COMFORTABLE_HEIGHT = 200;

/**
 * The side a contained popup opens on: below the anchor when there is comfortable room there,
 * otherwise above when that has more room, otherwise below. Unlike popper.js `flip`, it does not
 * need the whole popup to fit on a side, so a long list on a short screen still goes to the roomier
 * side, and it measures the uncapped content, so an earlier height cap cannot pin it below.
 */
export function pickSide(
  anchor: { top: number; bottom: number },
  viewportHeight: number,
  contentHeight: number,
  inset: number,
): 'top' | 'bottom' {
  const below = roomOnSide('bottom', anchor, viewportHeight, inset);
  const above = roomOnSide('top', anchor, viewportHeight, inset);
  if (below >= Math.min(contentHeight, COMFORTABLE_HEIGHT)) return 'bottom';
  return above > below ? 'top' : 'bottom';
}

/**
 * Floats its children by an anchor with `position: fixed`, so a scroll container or an
 * `overflow: hidden` ancestor (a Sheet's content) cannot clip it. It stays in the anchor's DOM
 * subtree rather than a body portal: a modal's focus trap would pull focus back out of a portal.
 * It flips to the other side when there is no room.
 */
export function Popper({
  open,
  anchorEl,
  placement = 'bottom-end',
  children,
  contain = false,
  ref,
}: PopperProps) {
  const inset = typeof contain === 'object' ? (contain.inset ?? 8) : 8;
  const modifiers: NonNullable<MuiPopperProps['modifiers']> = [
    // A contained popper picks its side itself (see `pickSide`), so `flip` is off.
    { name: 'flip', enabled: !contain },
  ];
  if (contain) {
    modifiers.push(
      { name: 'preventOverflow', options: { padding: inset } },
      {
        name: 'pickSide',
        enabled: true,
        phase: 'main',
        requires: ['popperOffsets'],
        fn: ({ state }) => {
          const [base, align] = state.placement.split('-');
          const side = pickSide(
            {
              top: state.rects.reference.y,
              bottom: state.rects.reference.y + state.rects.reference.height,
            },
            window.innerHeight,
            state.elements.popper.scrollHeight,
            inset,
          );
          if (base === side) return;
          state.placement = (
            align ? `${side}-${align}` : side
          ) as typeof state.placement;
          // The offsets were computed for the old side; run the cycle again for the new one.
          state.reset = true;
        },
      },
      {
        name: 'containHeight',
        enabled: true,
        phase: 'beforeWrite',
        fn: ({ state }) => {
          const room = roomOnSide(
            state.placement,
            {
              top: state.rects.reference.y,
              bottom: state.rects.reference.y + state.rects.reference.height,
            },
            window.innerHeight,
            inset,
          );
          state.styles.popper = {
            ...state.styles.popper,
            maxHeight: `${Math.max(room, MIN_POPUP_HEIGHT)}px`,
            overflowY: 'auto',
          };
        },
      },
    );
  }
  return (
    <MuiPopper
      ref={ref}
      open={open}
      anchorEl={anchorEl}
      placement={placement}
      disablePortal
      modifiers={modifiers}
      popperOptions={{ strategy: 'fixed' }}
      sx={{ zIndex: 2 }}
    >
      {children}
    </MuiPopper>
  );
}

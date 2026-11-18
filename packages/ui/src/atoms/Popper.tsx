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
   * Keeps a tall popup on screen: it flips to the side with room (also when the anchor is near the
   * bottom of a short screen) and its height is capped to the room on that side, so it scrolls
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
    contain
      ? { name: 'flip', enabled: true, options: { padding: inset } }
      : { name: 'flip', enabled: true },
  ];
  if (contain) {
    modifiers.push(
      { name: 'preventOverflow', options: { padding: inset } },
      {
        name: 'containHeight',
        enabled: true,
        phase: 'beforeWrite',
        requires: ['flip'],
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
            maxHeight: `${room}px`,
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

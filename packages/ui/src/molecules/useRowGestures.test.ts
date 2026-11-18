import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  swipeOffset,
  swipeZone,
  toggleOffset,
  toggleZone,
  useRowGestures,
  type RemoveGestureOptions,
} from './useRowGestures';

const WIDTH = 350; // the 390 pt reference; delete line 350 * 2/3 * 0.985 = 229.8

function pointer(x: number, y = 0, id = 1, interactive = false) {
  const target = {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    getBoundingClientRect: () => ({ width: WIDTH }),
  };
  return {
    pointerId: id,
    clientX: x,
    clientY: y,
    button: 0,
    isPrimary: true,
    currentTarget: target,
    target: { closest: () => (interactive ? {} : null) },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as PointerEvent<HTMLElement> & {
    currentTarget: typeof target;
    preventDefault: ReturnType<typeof vi.fn>;
    stopPropagation: ReturnType<typeof vi.fn>;
  };
}

function setup(options: Partial<RemoveGestureOptions> = {}) {
  const onAsk = vi.fn();
  const onDelete = vi.fn();
  const view = renderHook(() =>
    useRowGestures({ onAsk, onDelete, ...options }),
  );
  const bind = () => view.result.current.bind;
  /** Press at x=300, then move to `300 + dx`. */
  const drag = (dx: number, dy = 0) => {
    act(() => bind().onPointerDown(pointer(300, 0)));
    act(() => bind().onPointerMove(pointer(300 + dx, dy)));
  };
  const release = (dx: number) =>
    act(() => bind().onPointerUp(pointer(300 + dx)));
  return { view, bind, drag, release, onAsk, onDelete };
}

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'vibrate');
});

describe('swipe maths', () => {
  it('follows the finger up to the delete line, then at 0.4', () => {
    expect(swipeOffset(-50, WIDTH)).toBe(-50);
    const line = (WIDTH * 2) / 3;
    expect(swipeOffset(-(line * 0.985) - 100, WIDTH)).toBeCloseTo(
      -(line * 0.985) - 40,
    );
  });

  it('rubber-bands a right drag at 0.25', () => {
    expect(swipeOffset(100, WIDTH)).toBe(25);
  });

  it('picks the zone from the drag distance', () => {
    expect(swipeZone(-91.9, WIDTH)).toBe(0);
    expect(swipeZone(-92, WIDTH)).toBe(1);
    expect(swipeZone(-229, WIDTH)).toBe(1);
    expect(swipeZone(-230, WIDTH)).toBe(2);
    expect(swipeZone(40, WIDTH)).toBe(0);
  });
});

describe('useRowGestures', () => {
  it('does not start a drag within 8 pt, or when the move is vertical', () => {
    const { view, drag } = setup();
    drag(-8);
    expect(view.result.current.dragging).toBe(false);
    expect(view.result.current.x).toBe(0);

    drag(-20, 30);
    expect(view.result.current.dragging).toBe(false);
  });

  it('starts at more than 8 pt of mostly horizontal movement and captures the pointer', () => {
    const { view, bind } = setup();
    act(() => bind().onPointerDown(pointer(300)));
    const move = pointer(280, 5);
    act(() => bind().onPointerMove(move));
    expect(view.result.current.dragging).toBe(true);
    expect(view.result.current.x).toBe(-20);
    expect(move.currentTarget.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it('does not capture the pointer before the threshold, so taps reach children', () => {
    const { bind } = setup();
    act(() => bind().onPointerDown(pointer(300)));
    const move = pointer(296);
    act(() => bind().onPointerMove(move));
    expect(move.currentTarget.setPointerCapture).not.toHaveBeenCalled();
  });

  it('springs back and does nothing when released in zone 0', () => {
    const { view, drag, release, onAsk, onDelete } = setup();
    drag(-60);
    expect(view.result.current.zone).toBe(0);
    release(-60);
    expect(view.result.current.x).toBe(0);
    expect(view.result.current.dragging).toBe(false);
    expect(onAsk).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('asks when released in zone 1 and returns to rest', () => {
    const { view, drag, release, onAsk, onDelete } = setup();
    drag(-120);
    expect(view.result.current.zone).toBe(1);
    release(-120);
    expect(onAsk).toHaveBeenCalledOnce();
    expect(onDelete).not.toHaveBeenCalled();
    expect(view.result.current.x).toBe(0);
  });

  it('deletes when released in zone 2', () => {
    const { view, drag, release, onAsk, onDelete } = setup();
    drag(-260);
    expect(view.result.current.zone).toBe(2);
    release(-260);
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onAsk).not.toHaveBeenCalled();
    expect(view.result.current.dragging).toBe(false);
  });

  it('recomputes the zone when the finger moves back', () => {
    const { view, bind, drag, release, onAsk, onDelete } = setup();
    drag(-260);
    act(() => bind().onPointerMove(pointer(300 - 120)));
    expect(view.result.current.zone).toBe(1);
    release(-120);
    expect(onAsk).toHaveBeenCalledOnce();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('rubber-bands a right drag and does nothing on release', () => {
    const { view, drag, release, onAsk, onDelete } = setup();
    drag(100);
    expect(view.result.current.x).toBe(25);
    release(100);
    expect(view.result.current.x).toBe(0);
    expect(onAsk).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('springs back on pointercancel, even in zone 2', () => {
    const { view, bind, drag, onAsk, onDelete } = setup();
    drag(-260);
    act(() => bind().onPointerCancel(pointer(40)));
    expect(view.result.current.x).toBe(0);
    expect(view.result.current.dragging).toBe(false);
    expect(onAsk).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('ignores another pointer while dragging', () => {
    const { view, bind, drag } = setup();
    drag(-30);
    act(() => bind().onPointerMove(pointer(100, 0, 2)));
    expect(view.result.current.x).toBe(-30);
  });

  it('ignores pointers while disabled', () => {
    const { view, drag } = setup({ disabled: true });
    drag(-120);
    expect(view.result.current.dragging).toBe(false);
  });

  it('swallows the click after a drag, once', () => {
    const { bind, drag, release } = setup();
    drag(-60);
    release(-60);
    const first = pointer(0);
    bind().onClickCapture(first);
    expect(first.preventDefault).toHaveBeenCalled();
    expect(first.stopPropagation).toHaveBeenCalled();
    const second = pointer(0);
    bind().onClickCapture(second);
    expect(second.stopPropagation).not.toHaveBeenCalled();
  });

  it('lets a plain tap click through', () => {
    const { bind } = setup();
    act(() => bind().onPointerDown(pointer(300)));
    act(() => bind().onPointerUp(pointer(300)));
    const click = pointer(300);
    bind().onClickCapture(click);
    expect(click.stopPropagation).not.toHaveBeenCalled();
  });

  it('suppresses the context menu', () => {
    const { bind } = setup();
    const event = pointer(0);
    bind().onContextMenu(event as never);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('vibrates lightly in zone 1, firmer in zone 2, and again on the fly-off', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrate,
      configurable: true,
    });
    const { bind, drag, release } = setup();
    drag(-100);
    expect(vibrate).toHaveBeenLastCalledWith(10);
    act(() => bind().onPointerMove(pointer(300 - 260)));
    expect(vibrate).toHaveBeenLastCalledWith([14, 40, 22]);
    release(-260);
    expect(vibrate).toHaveBeenLastCalledWith([10, 30, 30]);
  });
});

describe('hold to edit', () => {
  function holdSetup(options: Partial<RemoveGestureOptions> = {}) {
    vi.useFakeTimers();
    const onHold = vi.fn();
    const rig = setup({ onHold, ...options });
    const press = () => act(() => rig.bind().onPointerDown(pointer(100, 20)));
    const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
    return { ...rig, onHold, press, advance };
  }

  it('starts pressing after 90 ms, not before', () => {
    const { view, press, advance } = holdSetup();
    press();
    advance(89);
    expect(view.result.current.pressing).toBe(false);
    advance(1);
    expect(view.result.current.pressing).toBe(true);
    expect(view.result.current.armed).toBe(false);
  });

  it('arms at 500 ms with a haptic and opens the editor 160 ms later, once', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrate,
      configurable: true,
    });
    const { view, press, advance, onHold } = holdSetup();
    press();
    advance(499);
    expect(view.result.current.armed).toBe(false);
    advance(1);
    expect(view.result.current.armed).toBe(true);
    expect(vibrate).toHaveBeenLastCalledWith(18);
    advance(159);
    expect(onHold).not.toHaveBeenCalled();
    advance(1);
    expect(onHold).toHaveBeenCalledTimes(1);
    advance(2000);
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('reports where the press began, relative to the row', () => {
    const { view, press, advance } = holdSetup();
    press();
    advance(90);
    expect(view.result.current.origin).toEqual({ x: 100, y: 20 });
  });

  it('cancels when the finger moves more than 8 pt', () => {
    const { view, bind, press, advance, onHold } = holdSetup();
    press();
    advance(100);
    act(() => bind().onPointerMove(pointer(100, 20 + 9)));
    expect(view.result.current.pressing).toBe(false);
    advance(1000);
    expect(view.result.current.armed).toBe(false);
    expect(onHold).not.toHaveBeenCalled();
  });

  it('does not hold when the press starts on a button inside the row, but still swipes from it', () => {
    const { view, bind, advance, onHold, onAsk } = holdSetup();
    act(() => bind().onPointerDown(pointer(300, 0, 1, true)));
    advance(1000);
    expect(view.result.current.pressing).toBe(false);
    expect(view.result.current.armed).toBe(false);
    expect(onHold).not.toHaveBeenCalled();
    act(() => bind().onPointerUp(pointer(300, 0, 1, true)));

    act(() => bind().onPointerDown(pointer(300, 0, 1, true)));
    act(() => bind().onPointerMove(pointer(300 - 100, 0, 1, true)));
    expect(view.result.current.dragging).toBe(true);
    act(() => bind().onPointerUp(pointer(300 - 100)));
    expect(onAsk).toHaveBeenCalledTimes(1);
  });

  it('keeps holding through a wobble of 8 pt or less', () => {
    const { bind, press, advance, onHold } = holdSetup();
    press();
    act(() => bind().onPointerMove(pointer(100 + 5, 20 + 5)));
    advance(700);
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('cancels when the pointer lifts early, and a quick tap still clicks', () => {
    const { view, bind, press, advance, onHold } = holdSetup();
    press();
    advance(300);
    act(() => bind().onPointerUp(pointer(100, 20)));
    expect(view.result.current.pressing).toBe(false);
    advance(1000);
    expect(onHold).not.toHaveBeenCalled();
    const click = pointer(100);
    bind().onClickCapture(click);
    expect(click.stopPropagation).not.toHaveBeenCalled();
  });

  it('cancels when the page scrolls (pointer cancel)', () => {
    const { view, bind, press, advance, onHold } = holdSetup();
    press();
    advance(200);
    act(() => bind().onPointerCancel(pointer(100, 20)));
    expect(view.result.current.pressing).toBe(false);
    advance(1000);
    expect(onHold).not.toHaveBeenCalled();
  });

  it('does not count the pointer-up that ends a hold as a tap', () => {
    const { bind, press, advance } = holdSetup();
    press();
    advance(500);
    act(() => bind().onPointerUp(pointer(100, 20)));
    const click = pointer(100);
    bind().onClickCapture(click);
    expect(click.stopPropagation).toHaveBeenCalled();
  });

  it('still opens the editor if the finger lifts during the 160 ms after arming', () => {
    const { bind, press, advance, onHold } = holdSetup();
    press();
    advance(500);
    act(() => bind().onPointerUp(pointer(100, 20)));
    advance(160);
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('does not hold while swiping', () => {
    const { view, bind, press, advance, onHold } = holdSetup();
    press();
    act(() => bind().onPointerMove(pointer(100 - 30, 20)));
    advance(1000);
    expect(view.result.current.pressing).toBe(false);
    expect(onHold).not.toHaveBeenCalled();
  });

  it('does nothing without onHold or while disabled', () => {
    vi.useFakeTimers();
    const none = setup();
    act(() => none.bind().onPointerDown(pointer(100, 20)));
    act(() => vi.advanceTimersByTime(1000));
    expect(none.view.result.current.pressing).toBe(false);
    const { view, press, advance, onHold } = holdSetup({ disabled: true });
    press();
    advance(1000);
    expect(view.result.current.pressing).toBe(false);
    expect(onHold).not.toHaveBeenCalled();
  });

  it('clears its timers on unmount', () => {
    const { view, press, advance, onHold } = holdSetup();
    press();
    advance(400);
    view.unmount();
    advance(2000);
    expect(onHold).not.toHaveBeenCalled();
  });
});

describe('onLearned', () => {
  it('fires once when a swipe reaches zone 1, before release, and not again', () => {
    const onLearned = vi.fn();
    const { drag, bind, release } = setup({ onLearned });
    drag(-60);
    expect(onLearned).not.toHaveBeenCalled();
    act(() => bind().onPointerMove(pointer(300 - 120)));
    expect(onLearned).toHaveBeenCalledTimes(1);
    act(() => bind().onPointerMove(pointer(300 - 260)));
    release(-260);
    expect(onLearned).toHaveBeenCalledTimes(1);
  });

  it('fires when one move jumps from zone 0 to zone 2', () => {
    const onLearned = vi.fn();
    const { drag } = setup({ onLearned });
    drag(-260);
    expect(onLearned).toHaveBeenCalledTimes(1);
  });

  it('still counts a drag that reached zone 1 and went back to zone 0', () => {
    const onLearned = vi.fn();
    const { drag, bind, release } = setup({ onLearned });
    drag(-120);
    act(() => bind().onPointerMove(pointer(300 - 20)));
    release(-20);
    expect(onLearned).toHaveBeenCalledTimes(1);
  });

  it('never fires for a drag that stays in zone 0', () => {
    const onLearned = vi.fn();
    const { drag, release } = setup({ onLearned });
    drag(-60);
    release(-60);
    expect(onLearned).not.toHaveBeenCalled();
  });

  it('fires when a hold arms, and not when it is cancelled first', () => {
    vi.useFakeTimers();
    const onLearned = vi.fn();
    const rig = setup({ onLearned, onHold: vi.fn() });
    act(() => rig.bind().onPointerDown(pointer(100, 20)));
    act(() => vi.advanceTimersByTime(499));
    expect(onLearned).not.toHaveBeenCalled();
    act(() => rig.bind().onPointerUp(pointer(100, 20)));
    act(() => vi.advanceTimersByTime(1000));
    expect(onLearned).not.toHaveBeenCalled();
    act(() => rig.bind().onPointerDown(pointer(100, 20)));
    act(() => vi.advanceTimersByTime(500));
    expect(onLearned).toHaveBeenCalledTimes(1);
  });
});

describe('toggle mode', () => {
  function toggleSetup(options: { disabled?: boolean } = {}) {
    const onToggle = vi.fn();
    const view = renderHook(() =>
      useRowGestures({ mode: 'toggle', onToggle, ...options }),
    );
    const bind = () => view.result.current.bind;
    const drag = (dx: number, dy = 0) => {
      act(() => bind().onPointerDown(pointer(300, 0)));
      act(() => bind().onPointerMove(pointer(300 + dx, dy)));
    };
    const release = (dx: number) =>
      act(() => bind().onPointerUp(pointer(300 + dx)));
    return { view, bind, drag, release, onToggle };
  }

  describe('maths', () => {
    it('follows the finger to 1.4 x reveal (128.8 pt), then at .35', () => {
      expect(toggleOffset(-50)).toBe(-50);
      expect(toggleOffset(-128.8)).toBeCloseTo(-128.8);
      expect(toggleOffset(-228.8)).toBeCloseTo(-163.8);
    });

    it('rubber-bands a right drag at .25', () => {
      expect(toggleOffset(100)).toBe(25);
    });

    it('has a single zone from 92 pt', () => {
      expect(toggleZone(-91.9)).toBe(0);
      expect(toggleZone(-92)).toBe(1);
      expect(toggleZone(-300)).toBe(1);
      expect(toggleZone(120)).toBe(0);
    });
  });

  it('starts after 8 pt of mostly horizontal movement and captures the pointer', () => {
    const { view, bind, drag } = toggleSetup();
    drag(-8);
    expect(view.result.current.dragging).toBe(false);
    act(() => bind().onPointerDown(pointer(300)));
    const move = pointer(280, 5);
    act(() => bind().onPointerMove(move));
    expect(view.result.current.dragging).toBe(true);
    expect(view.result.current.x).toBe(-20);
    expect(move.currentTarget.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it('never reaches the remove zone however far the row goes', () => {
    const { view, drag } = toggleSetup();
    drag(-300);
    expect(view.result.current.zone).toBe(1);
    expect(view.result.current.x).toBeCloseTo(-128.8 - (300 - 128.8) * 0.35);
  });

  it('toggles on a release inside the zone, and springs back', () => {
    const { view, drag, release, onToggle } = toggleSetup();
    drag(-92);
    expect(view.result.current.zone).toBe(1);
    release(-92);
    expect(onToggle).toHaveBeenCalledOnce();
    expect(view.result.current).toMatchObject({
      x: 0,
      zone: 0,
      dragging: false,
    });
  });

  it('springs back without toggling on a release short of the zone', () => {
    const { view, drag, release, onToggle } = toggleSetup();
    drag(-91);
    release(-91);
    expect(onToggle).not.toHaveBeenCalled();
    expect(view.result.current.x).toBe(0);
  });

  it('springs back without toggling after a far drag to the right', () => {
    const { view, drag, release, onToggle } = toggleSetup();
    drag(200);
    expect(view.result.current.x).toBe(50);
    release(200);
    expect(onToggle).not.toHaveBeenCalled();
    expect(view.result.current.x).toBe(0);
  });

  it('cancels on vertical movement', () => {
    const { view, drag, release, onToggle } = toggleSetup();
    drag(-5, 20);
    act(() => view.result.current.bind.onPointerMove(pointer(150, 20)));
    expect(view.result.current.dragging).toBe(false);
    release(-150);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('springs back without toggling on pointercancel, even in the zone', () => {
    const { view, bind, drag, onToggle } = toggleSetup();
    drag(-150);
    act(() => bind().onPointerCancel(pointer(150)));
    expect(view.result.current.x).toBe(0);
    expect(view.result.current.dragging).toBe(false);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('vibrates 10 ms on entering the zone', () => {
    const buzz = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      value: buzz,
      configurable: true,
    });
    const { bind, drag } = toggleSetup();
    drag(-60);
    expect(buzz).not.toHaveBeenCalled();
    act(() => bind().onPointerMove(pointer(300 - 100)));
    expect(buzz).toHaveBeenCalledWith(10);
  });

  it('swallows the click after a drag', () => {
    const { bind, drag, release } = toggleSetup();
    drag(-40);
    release(-40);
    const click = pointer(260);
    act(() => bind().onClickCapture(click));
    expect(click.preventDefault).toHaveBeenCalled();
  });

  it('ignores pointers while disabled', () => {
    const { view, drag, release, onToggle } = toggleSetup({ disabled: true });
    drag(-120);
    expect(view.result.current.dragging).toBe(false);
    release(-120);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

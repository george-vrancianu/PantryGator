import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRowHint } from './useRowHint';

const KEY = 'pp.rowHint.shopping';

describe('useRowHint', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const setup = (active = true) =>
    renderHook(({ on }) => useRowHint('shopping', on), {
      initialProps: { on: active },
      wrapper: StrictMode,
    });

  it('shows the pill and peeks 700 ms after the list has rows, and remembers it', () => {
    const { result } = setup();
    expect(result.current.visible).toBe(false);
    act(() => vi.advanceTimersByTime(699));
    expect(result.current.visible).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.visible).toBe(true);
    expect(result.current.peek).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('1');
  });

  it('sets the flag once even though StrictMode runs the effect twice', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    setup();
    act(() => vi.advanceTimersByTime(5000));
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('stops peeking after the peek is over, but keeps the pill', () => {
    const { result } = setup();
    act(() => vi.advanceTimersByTime(700));
    act(() => vi.advanceTimersByTime(1200));
    expect(result.current.peek).toBe(false);
    expect(result.current.visible).toBe(true);
  });

  it('shows nothing and sets no flag for an empty list, until it has rows', () => {
    const { result, rerender } = setup(false);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.visible).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
    rerender({ on: true });
    act(() => vi.advanceTimersByTime(700));
    expect(result.current.visible).toBe(true);
  });

  it('does not set the flag when the list empties before 700 ms', () => {
    const { result, rerender } = setup();
    act(() => vi.advanceTimersByTime(400));
    rerender({ on: false });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.visible).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('gives the space back when a gesture skips the hint before it shows', () => {
    const { result } = setup();
    expect(result.current.reserve).toBe(true);
    act(() => result.current.onLearned());
    act(() => {
      window.dispatchEvent(new Event('pointerup'));
    });
    expect(result.current.reserve).toBe(false);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.visible).toBe(false);
    expect(result.current.reserve).toBe(false);
  });

  it.each(['pointerup', 'pointercancel'])(
    'keeps the space while the gesture that learned is still down, and gives it back on %s',
    (end) => {
      const { result } = setup();
      act(() => vi.advanceTimersByTime(300));
      act(() => result.current.onLearned());
      expect(result.current.reserve).toBe(true);
      act(() => vi.advanceTimersByTime(5000));
      expect(result.current.reserve).toBe(true);
      act(() => {
        window.dispatchEvent(new Event(end));
      });
      expect(result.current.reserve).toBe(false);
    },
  );

  it('reserves the pill space while the list has rows, before the hint and after it fades', () => {
    const { result, rerender } = setup(false);
    expect(result.current.reserve).toBe(false);
    rerender({ on: true });
    expect(result.current.reserve).toBe(true);
    expect(result.current.visible).toBe(false);
    act(() => vi.advanceTimersByTime(700));
    act(() => result.current.onLearned());
    expect(result.current.visible).toBe(false);
    expect(result.current.reserve).toBe(true);
  });

  it('reserves nothing once the flag is stored', () => {
    localStorage.setItem(KEY, '1');
    const { result } = setup();
    expect(result.current.reserve).toBe(false);
  });

  it('shows nothing once the flag is stored', () => {
    localStorage.setItem(KEY, '1');
    const { result } = setup();
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.visible).toBe(false);
    expect(result.current.peek).toBe(false);
  });

  it('closes the pill once a gesture was used', () => {
    const { result } = setup();
    act(() => vi.advanceTimersByTime(700));
    act(() => result.current.onLearned());
    expect(result.current.visible).toBe(false);
  });

  it('a gesture used before the hint shows suppresses it for good', () => {
    const { result } = setup();
    act(() => vi.advanceTimersByTime(300));
    act(() => result.current.onLearned());
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.visible).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('1');
  });

  it('still shows the hint when storage is blocked, without throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = setup();
    act(() => vi.advanceTimersByTime(700));
    expect(result.current.visible).toBe(true);
  });

  it('clears its timers on unmount', () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    const set = vi.spyOn(globalThis, 'setTimeout');
    const view = setup();
    act(() => vi.advanceTimersByTime(700));
    const peekTimer = set.mock.results.at(-1)?.value;
    view.unmount();
    expect(clear).toHaveBeenCalledWith(peekTimer);
  });
});

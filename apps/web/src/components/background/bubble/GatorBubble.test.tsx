import { Sheet, useToast } from '@pocket-pantry/ui';
import { authoredCss } from '@pocket-pantry/ui/test/authoredCss';
import { act, fireEvent, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const floor = vi.hoisted(() => vi.fn());
vi.mock('@pocket-pantry/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@pocket-pantry/ui')>()),
  // Records each registration and its release, as the real hook does.
  useToastFloor: (bottom: number | string | null) =>
    useEffect(() => {
      if (bottom === null) return;
      floor(bottom);
      return () => floor(null);
    }, [bottom]),
}));
import { renderWithProviders } from '../../../test/render';
import { stubMatchMedia } from '../../../test/viewport';
import { announcements } from '../../../test/voice';
import type { BackgroundItem, BackgroundStatus } from '../backgroundItem';
import { PLACEMENT_KEY } from './bubblePlacement';
import { GatorBubble } from './GatorBubble';
import { LABEL_MS, resetBubbleAnnouncement } from './useBubbleAnnouncement';

const job = (id: string, status: BackgroundStatus): BackgroundItem => ({
  kind: 'photo',
  id,
  title: id,
  detail: '',
  status,
  createdAt: 1,
  actions: [],
});

const bubble = () => screen.queryByRole('button', { name: /Open Review/ });

const controls: {
  setItems: (items: BackgroundItem[]) => void;
  setSheet: (open: boolean) => void;
  toast: (message: string) => void;
} = { setItems: () => {}, setSheet: () => {}, toast: () => {} };

/** The bubble beside a Sheet, with the items and the Sheet driven from the test. */
function Harness({
  initial,
  dock,
  openSheet,
}: {
  initial: BackgroundItem[];
  dock: boolean;
  openSheet: () => void;
}) {
  const [items, setItems] = useState(initial);
  const [sheet, setSheet] = useState(false);
  const toast = useToast();
  useEffect(() => {
    controls.setItems = setItems;
    controls.setSheet = setSheet;
    controls.toast = (message) => toast.show(message, { polite: true });
  }, [toast]);
  return (
    <>
      <GatorBubble items={items} dock={dock} openSheet={openSheet} />
      <Sheet open={sheet} onClose={() => setSheet(false)} label="Other">
        x
      </Sheet>
    </>
  );
}

function show(items: BackgroundItem[], openSheet = vi.fn(), dock = true) {
  return renderWithProviders(
    <Harness initial={items} dock={dock} openSheet={openSheet} />,
  );
}

const change = (items: BackgroundItem[]) => act(() => controls.setItems(items));

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  resetBubbleAnnouncement();
});
afterEach(() => {
  floor.mockClear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('GatorBubble states', () => {
  it('is hidden when the queue is empty', () => {
    show([]);
    expect(bubble()).not.toBeInTheDocument();
    expect(screen.queryByTestId('gator-bubble')).not.toBeInTheDocument();
  });

  it('Reading: a gold arc and a grey count', () => {
    show([job('a', 'reading'), job('b', 'reading')]);
    expect(
      screen.getByRole('button', {
        name: 'Gator is working: 2 being read. Open Review',
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('gator-bubble')).toHaveAttribute(
      'data-state',
      'reading',
    );
    expect(screen.getByTestId('badge-reading')).toHaveTextContent('2');
    const arcs = screen.getAllByTestId('bubble-arc');
    expect(arcs).toHaveLength(1);
    expect(arcs[0]).toHaveAttribute('data-colour', 'var(--pp-gold)');
  });

  it('Some ready: gold count ready, grey count reading, gold and cream ring', () => {
    show([job('a', 'ready'), job('b', 'ready'), job('c', 'reading')]);
    expect(screen.getByTestId('gator-bubble')).toHaveAttribute(
      'data-state',
      'someReady',
    );
    expect(screen.getByTestId('badge-ready')).toHaveTextContent('2');
    expect(screen.getByTestId('badge-reading')).toHaveTextContent('1');
    expect(
      screen.getAllByTestId('bubble-arc').map((a) => a.dataset.colour),
    ).toEqual(['var(--pp-gold)', 'var(--pp-bubble-grey-bg)']);
    expect(
      screen.getByRole('button', { name: /2 ready to review\. Open Review/ }),
    ).toBeInTheDocument();
  });

  it('All done: a gold disc, a full green ring and a green badge with the count', () => {
    show([job('a', 'ready'), job('b', 'ready')]);
    expect(screen.getByTestId('gator-bubble')).toHaveAttribute(
      'data-state',
      'allDone',
    );
    expect(screen.getByTestId('badge-done')).toHaveTextContent('2');
    const arcs = screen.getAllByTestId('bubble-arc');
    expect(arcs).toHaveLength(1);
    expect(arcs[0]).toHaveAttribute('data-colour', 'var(--pp-bubble-green-bg)');
    expect(
      screen.getByRole('button', {
        name: 'All read: 2 ready to review. Open Review',
      }),
    ).toBeInTheDocument();
  });

  it('Could not read: gold count ready, red count failed, gold and red ring', () => {
    show([job('a', 'ready'), job('b', 'failed')]);
    expect(screen.getByTestId('gator-bubble')).toHaveAttribute(
      'data-state',
      'couldNotRead',
    );
    expect(screen.getByTestId('badge-ready')).toHaveTextContent('1');
    expect(screen.getByTestId('badge-failed')).toHaveTextContent('1');
    expect(
      screen.getAllByTestId('bubble-arc').map((a) => a.dataset.colour),
    ).toEqual(['var(--pp-gold)', 'var(--pp-bubble-ring-red)']);
    expect(
      screen.getByRole('button', {
        name: '1 ready to review, 1 could not be read. Open Review',
      }),
    ).toBeInTheDocument();
  });
});

describe('GatorBubble tap', () => {
  it('opens the Review sheet', () => {
    const openSheet = vi.fn();
    show([job('a', 'reading')], openSheet);
    fireEvent.click(bubble()!);
    expect(openSheet).toHaveBeenCalledTimes(1);
  });
});

describe('GatorBubble placement', () => {
  it('rests on the right and moves to an edge with the arrow keys, remembered per device', () => {
    const view = show([job('a', 'reading')]);
    const at = () => screen.getByTestId('gator-bubble').dataset.side;
    expect(at()).toBe('right');
    fireEvent.keyDown(bubble()!, { key: 'ArrowLeft' });
    expect(at()).toBe('left');
    fireEvent.keyDown(bubble()!, { key: 'ArrowRight' });
    expect(at()).toBe('right');
    fireEvent.keyDown(bubble()!, { key: 'ArrowLeft' });
    expect(JSON.parse(window.localStorage.getItem(PLACEMENT_KEY)!)).toEqual({
      side: 'left',
      lift: 0,
    });
    // A reload: a fresh mount reads it back.
    view.unmount();
    show([job('a', 'reading')]);
    expect(at()).toBe('left');
  });

  it('ignores other keys', () => {
    show([job('a', 'reading')]);
    fireEvent.keyDown(bubble()!, { key: 'ArrowUp' });
    expect(window.localStorage.getItem(PLACEMENT_KEY)).toBeNull();
  });

  it('scales up while held, snaps to the nearer edge on release, and the drop is not a tap', () => {
    vi.stubGlobal('innerWidth', 400);
    const openSheet = vi.fn();
    show([job('a', 'reading')], openSheet);
    const button = bubble()!;
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      left: 328,
      top: 500,
    } as DOMRect);
    vi.spyOn(
      screen.getByTestId('gator-bubble-bounds'),
      'getBoundingClientRect',
    ).mockReturnValue({ top: 100, bottom: 700 } as DOMRect);

    fireEvent.pointerDown(button, { pointerId: 1, clientX: 350, clientY: 520 });
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 100, clientY: 400 });
    expect(screen.getByTestId('gator-bubble-origin')).toBeInTheDocument();
    expect(getComputedStyle(button).transform).toContain('scale(1.12)');

    fireEvent.pointerUp(button, { pointerId: 1, clientX: 100, clientY: 400 });
    fireEvent.click(button);
    expect(openSheet).not.toHaveBeenCalled();
    expect(screen.getByTestId('gator-bubble')).toHaveAttribute(
      'data-side',
      'left',
    );
    // Dropped with its top at 500 - 120 = 380: bottom 436, 264 above the lowest spot.
    expect(JSON.parse(window.localStorage.getItem(PLACEMENT_KEY)!)).toEqual({
      side: 'left',
      lift: 264,
    });
    expect(screen.queryByTestId('gator-bubble-origin')).not.toBeInTheDocument();
    // The next click is a tap again.
    fireEvent.click(button);
    expect(openSheet).toHaveBeenCalledTimes(1);
  });

  it('treats a press that barely moves as a tap', () => {
    const openSheet = vi.fn();
    show([job('a', 'reading')], openSheet);
    const button = bubble()!;
    fireEvent.pointerDown(button, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 12, clientY: 11 });
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 12, clientY: 11 });
    fireEvent.click(button);
    expect(openSheet).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(PLACEMENT_KEY)).toBeNull();
  });

  it('bounds its height by the header input and rests 16 above the Dock or the bottom inset', () => {
    const view = show([job('a', 'reading')], vi.fn(), true);
    const css = (el: HTMLElement) => authoredCss(el);
    const dockCss = css(screen.getByTestId('gator-bubble'));
    expect(dockCss).toContain('--gator-bubble-top');
    expect(dockCss).toContain('82px');
    view.unmount();
    show([job('a', 'reading')], vi.fn(), false);
    const plainCss = css(screen.getByTestId('gator-bubble'));
    expect(plainCss).toContain('safe-area-inset-bottom');
    expect(plainCss).toContain('16px');
    expect(plainCss).not.toContain('82px');
  });
});

describe('GatorBubble accessibility', () => {
  it('draws the Theme focus ring when focused by keyboard', () => {
    show([job('a', 'reading')]);
    expect(authoredCss(bubble()!)).toContain(':focus-visible');
  });

  it('does not scale while held when motion is reduced', () => {
    stubMatchMedia((query) => query.includes('prefers-reduced-motion'));
    show([job('a', 'reading')]);
    const button = bubble()!;
    fireEvent.pointerDown(button, { pointerId: 1, clientX: 350, clientY: 520 });
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 100, clientY: 400 });
    expect(getComputedStyle(button).transform).toContain('scale(1)');
    expect(getComputedStyle(button).transform).not.toContain('scale(1.12)');
  });
});

describe('GatorBubble toast floor', () => {
  it('lifts toasts above the bubble while it rests near the bottom, and lets go when it goes', () => {
    const view = show([job('a', 'reading')]);
    expect(floor).toHaveBeenLastCalledWith(expect.stringContaining('+ 56px)'));
    act(() => controls.setSheet(true));
    expect(floor).toHaveBeenLastCalledWith(null);
    view.unmount();
  });

  it('leaves toasts alone once the bubble was dragged up out of their way', () => {
    window.localStorage.setItem(
      PLACEMENT_KEY,
      JSON.stringify({ side: 'right', lift: 300 }),
    );
    show([job('a', 'reading')]);
    expect(floor).not.toHaveBeenCalledWith(expect.any(String));
  });
});

describe('GatorBubble visibility', () => {
  it('hides under a Sheet and returns when it closes', () => {
    show([job('a', 'reading')]);
    expect(bubble()).toBeInTheDocument();
    act(() => controls.setSheet(true));
    expect(screen.queryByTestId('gator-bubble')).not.toBeInTheDocument();
    act(() => controls.setSheet(false));
    expect(screen.getByTestId('gator-bubble')).toBeInTheDocument();
  });
});

describe('GatorBubble announcements', () => {
  it('announces each state change once through the toast live region', () => {
    show([job('a', 'reading')]);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Gator is working: 1 being read',
    );
    // Re-rendering with the same state says nothing more.
    change([job('a', 'reading')]);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    // A change announces the new state, once the first announcement has had its time.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    change([job('a', 'ready')]);
    expect(screen.getByRole('status')).toHaveTextContent(
      'All read: 1 ready to review',
    );
  });

  it('waits for a toast that is showing instead of pushing it out', () => {
    show([job('a', 'reading')]);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    act(() => controls.toast('Item removed'));
    change([job('a', 'ready')]);
    expect(announcements()).toEqual(['Item removed']);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(announcements()).toEqual(['All read: 1 ready to review']);
  });

  it('does not announce the same state again when it remounts', () => {
    const first = show([job('a', 'reading')]);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    first.unmount();
    show([job('a', 'reading')]);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps the All done label up until the state changes', () => {
    show([job('a', 'ready'), job('b', 'ready')]);
    act(() => {
      vi.advanceTimersByTime(LABEL_MS * 4);
    });
    expect(screen.getByTestId('gator-bubble-label')).toHaveTextContent(
      'All read: 2 ready to review',
    );
    change([job('a', 'ready'), job('b', 'reading')]);
    act(() => {
      vi.advanceTimersByTime(LABEL_MS);
    });
    expect(screen.queryByTestId('gator-bubble-label')).not.toBeInTheDocument();
  });

  it('does not announce again when only a count the sentence leaves out changes', () => {
    show([job('a', 'ready'), job('b', 'reading')]);
    const before = announcements().length;
    change([job('a', 'ready'), job('b', 'reading'), job('c', 'reading')]);
    expect(announcements()).toHaveLength(before);
  });

  it('slides a label out for 3 seconds on each state change', () => {
    show([job('a', 'reading')]);
    expect(screen.getByTestId('gator-bubble-label')).toHaveTextContent(
      'Gator is working: 1 being read',
    );
    act(() => {
      vi.advanceTimersByTime(LABEL_MS - 1);
    });
    expect(screen.getByTestId('gator-bubble-label')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByTestId('gator-bubble-label')).not.toBeInTheDocument();
    change([job('a', 'ready'), job('b', 'ready')]);
    expect(screen.getByTestId('gator-bubble-label')).toHaveTextContent(
      'All read: 2 ready to review',
    );
  });
});

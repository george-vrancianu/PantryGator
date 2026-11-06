import { act, fireEvent, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { selected, slider } from '../../test/scan';
import { ScanPage } from './ScanPage';

vi.mock('../../lib/camera', async () =>
  (await import('../../test/scan')).fakeCameraModule(),
);

function renderScan(route = '/scan') {
  return renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
    </Routes>,
    { route },
  );
}

const item = (name: string) => within(slider()).getByRole('radio', { name });
/** Where the strip is: it moves with a finger and comes back on release. */
const stripAt = () => getComputedStyle(slider()).transform;

let now = 0;
beforeEach(() => {
  localStorage.clear();
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

/** Pointer drag on the slider (or the viewfinder): down at (0,0), move to (dx,dy), release after `ms`. */
function drag(
  target: Element,
  {
    dx,
    dy = 0,
    ms = 600,
    release = true,
    pointerType = 'touch',
  }: {
    dx: number;
    dy?: number;
    ms?: number;
    release?: boolean;
    pointerType?: string;
  },
) {
  const base = {
    pointerId: 1,
    pointerType,
    isPrimary: true,
    button: 0,
  };
  fireEvent.pointerDown(target, { ...base, clientX: 200, clientY: 500 });
  now += ms / 2;
  fireEvent.pointerMove(target, {
    ...base,
    clientX: 200 + dx / 2,
    clientY: 500 + dy / 2,
  });
  now += ms / 2;
  fireEvent.pointerMove(target, {
    ...base,
    clientX: 200 + dx,
    clientY: 500 + dy,
  });
  if (release)
    fireEvent.pointerUp(target, {
      ...base,
      clientX: 200 + dx,
      clientY: 500 + dy,
    });
}

describe('Scan mode slider gestures', () => {
  it('a slow horizontal drag past halfway to the next word moves to that mode', () => {
    renderScan('/scan?mode=product');
    drag(item('Product'), { dx: -50 });
    expect(selected()).toEqual(['Barcode']);
  });

  it('dragging right moves to the previous mode', () => {
    renderScan('/scan?mode=product');
    drag(item('Product'), { dx: 120 });
    expect(selected()).toEqual(['Ingredients']);
  });

  it('a short slow drag snaps back to the same mode', () => {
    renderScan('/scan?mode=product');
    drag(item('Product'), { dx: -30 });
    expect(selected()).toEqual(['Product']);
  });

  it('a quick short flick advances exactly one step', () => {
    renderScan('/scan?mode=product');
    drag(item('Product'), { dx: -20, ms: 20 });
    expect(selected()).toEqual(['Barcode']);
  });

  it('a vertical drag does not change mode', () => {
    renderScan('/scan?mode=product');
    drag(item('Product'), { dx: -8, dy: 120 });
    expect(selected()).toEqual(['Product']);
  });

  it('under 10 pt of movement is not a drag', () => {
    renderScan('/scan?mode=product');
    drag(item('Product'), { dx: -9, ms: 20 });
    expect(selected()).toEqual(['Product']);
  });

  it('dragging past the last item stays on the last item', () => {
    renderScan('/scan?mode=plate');
    drag(item('Plate'), { dx: -300 });
    expect(selected()).toEqual(['Plate']);
  });

  it('dragging past the first item stays on the first item', () => {
    renderScan('/scan?mode=receipt');
    drag(item('Receipt'), { dx: 300 });
    expect(selected()).toEqual(['Receipt']);
  });

  it('moves the strip with the finger while dragging and settles on release', () => {
    renderScan('/scan?mode=product');
    const rest = stripAt();
    drag(item('Product'), { dx: -40, release: false });
    const dragged = stripAt();
    expect(dragged).not.toBe(rest);
    drag(item('Product'), { dx: -40, release: false });
    expect(stripAt()).toBe(dragged);
  });

  it('lets the strip stretch a little past the first word, then springs back', () => {
    renderScan('/scan?mode=receipt');
    const rest = stripAt();
    drag(item('Receipt'), { dx: 100, release: false });
    expect(stripAt()).not.toBe(rest);
    fireEvent.pointerUp(item('Receipt'), {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: 300,
      clientY: 500,
    });
    expect(selected()).toEqual(['Receipt']);
    expect(stripAt()).toBe(rest);
  });

  it('also changes mode from a swipe on the viewfinder', () => {
    renderScan('/scan?mode=product');
    drag(screen.getByTestId('scan-feed'), { dx: -50 });
    expect(selected()).toEqual(['Barcode']);
    // The guide lets touches through to the feed under it (pointer-events: none).
    drag(screen.getByTestId('scan-feed'), { dx: 150 });
    expect(selected()).toEqual(['Ingredients']);
  });

  it('ignores a swipe that starts on the top bar', () => {
    renderScan('/scan?mode=product');
    drag(screen.getByRole('button', { name: 'Close scanner' }), { dx: -200 });
    expect(selected()).toEqual(['Product']);
  });

  it('ignores the click that follows a drag', async () => {
    renderScan('/scan?mode=product');
    // The drag ends on Receipt (the browser then fires a click on the pressed icon).
    drag(item('Product'), { dx: 120 });
    expect(selected()).toEqual(['Ingredients']);
    fireEvent.click(item('Plate'));
    expect(selected()).toEqual(['Ingredients']);
  });

  it('selects by tap again once the drag is over', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      renderScan('/scan?mode=product');
      drag(item('Product'), { dx: 120 });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      fireEvent.click(item('Plate'));
      expect(selected()).toEqual(['Plate']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a pointer cancel snaps back and changes nothing', () => {
    renderScan('/scan?mode=product');
    const rest = stripAt();
    drag(item('Product'), { dx: -100, release: false });
    fireEvent.pointerCancel(item('Product'), { pointerId: 1 });
    expect(selected()).toEqual(['Product']);
    expect(stripAt()).toBe(rest);
  });

  it('works with a mouse pointer', () => {
    renderScan('/scan?mode=product');
    drag(item('Product'), { dx: -50, pointerType: 'mouse' });
    expect(selected()).toEqual(['Barcode']);
  });

  it('ignores a second pointer: it neither moves the strip nor ends the drag', () => {
    renderScan('/scan?mode=product');
    const radio = item('Product');
    const first = {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
    };
    const second = {
      pointerId: 2,
      pointerType: 'touch',
      isPrimary: false,
      button: 0,
    };
    fireEvent.pointerDown(radio, { ...first, clientX: 200, clientY: 500 });
    now += 300;
    fireEvent.pointerMove(radio, { ...first, clientX: 150, clientY: 500 });
    const dragged = stripAt();
    fireEvent.pointerDown(radio, { ...second, clientX: 300, clientY: 500 });
    fireEvent.pointerMove(radio, { ...second, clientX: 0, clientY: 500 });
    expect(stripAt()).toBe(dragged);
    fireEvent.pointerUp(radio, { ...second, clientX: 0, clientY: 500 });
    expect(selected()).toEqual(['Product']);
    // the first finger is still dragging and decides the release
    now += 300;
    fireEvent.pointerUp(radio, { ...first, clientX: 150, clientY: 500 });
    expect(selected()).toEqual(['Barcode']);
  });

  it('keeps the strip and the release target relative to where the drag began when the mode changes mid-drag', () => {
    renderScan('/scan?mode=product');
    const radio = item('Product');
    const mouse = {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
    };
    fireEvent.pointerDown(radio, { ...mouse, clientX: 200, clientY: 500 });
    now += 600;
    fireEvent.pointerMove(radio, { ...mouse, clientX: 180, clientY: 500 });
    const dragged = stripAt();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(selected()).toEqual(['Barcode']);
    expect(stripAt()).toBe(dragged);
    fireEvent.pointerUp(radio, { ...mouse, clientX: 180, clientY: 500 });
    // 20 px from where the drag began snaps back to where it began
    expect(selected()).toEqual(['Product']);
  });

  it('does not start a drag while the slider is disabled', () => {
    renderScan('/scan?mode=product');
    fireEvent.click(screen.getByRole('button', { name: 'How scanning works' }));
    drag(slider(), { dx: -150 });
    expect(selected()).toEqual(['Product']);
  });

  it('does not change mode on release if the slider became disabled mid-drag', () => {
    renderScan('/scan?mode=product');
    const radio = item('Product');
    const touch = {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
    };
    fireEvent.pointerDown(radio, { ...touch, clientX: 200, clientY: 500 });
    now += 600;
    fireEvent.pointerMove(radio, { ...touch, clientX: 120, clientY: 500 });
    fireEvent.click(screen.getByRole('button', { name: 'How scanning works' }));
    fireEvent.pointerUp(radio, { ...touch, clientX: 120, clientY: 500 });
    expect(selected()).toEqual(['Product']);
  });
});

describe('Scan mode slider with measured words', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Words 80 pt wide with 130 pt between their centres, instead of the fallback spacing. */
  const measureWords = () => {
    const isWord = (el: HTMLElement) => el.getAttribute('role') === 'radio';
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
      function (this: HTMLElement) {
        return isWord(this) ? 80 : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(
      function (this: HTMLElement) {
        return isWord(this)
          ? Array.from(this.parentElement?.children ?? []).indexOf(this) * 130
          : 0;
      },
    );
  };

  it('settles on the word whose measured centre is nearest, not on a fixed spacing', () => {
    measureWords();
    renderScan('/scan?mode=product');
    // 60 pt of a 130 pt gap is under halfway: back to Product (a fixed 84 pt spacing would move on).
    drag(item('Product'), { dx: -60 });
    expect(selected()).toEqual(['Product']);
    drag(item('Product'), { dx: -70 });
    expect(selected()).toEqual(['Barcode']);
  });
});

import { act, fireEvent, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { selected, slider } from '../../test/scan';
import { stubScreen } from '../../test/screen';
import { ScanPage } from './ScanPage';

// With the chrome rotated back, the slider's strip runs along the screen's other axis: a swipe is
// read in the frame's directions (ADR 0037).
vi.mock('../../lib/camera', async () =>
  (await import('../../test/scan')).fakeCameraModule(),
);

const item = (name: string) => within(slider()).getByRole('radio', { name });
let now = 0;
beforeEach(() => {
  localStorage.clear();
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function drag(target: Element, dx: number, dy: number) {
  const base = {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
  };
  fireEvent.pointerDown(target, { ...base, clientX: 200, clientY: 200 });
  now += 300;
  fireEvent.pointerMove(target, {
    ...base,
    clientX: 200 + dx / 2,
    clientY: 200 + dy / 2,
  });
  now += 300;
  fireEvent.pointerMove(target, {
    ...base,
    clientX: 200 + dx,
    clientY: 200 + dy,
  });
  fireEvent.pointerUp(target, {
    ...base,
    clientX: 200 + dx,
    clientY: 200 + dy,
  });
}

function renderRotated(angle: 90 | 270) {
  const s = stubScreen({ width: 390, height: 844 });
  renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
    </Routes>,
    { route: '/scan?mode=product' },
  );
  act(() => s.rotate(angle));
}

describe('Scan mode slider with the chrome rotated back', () => {
  it('at 90 a swipe down the screen is a swipe left along the strip', () => {
    renderRotated(90);
    drag(item('Product'), 0, 50);
    expect(selected()).toEqual(['Barcode']);
  });

  it("at 90 a swipe along the screen's width is not along the strip", () => {
    renderRotated(90);
    drag(item('Product'), -50, 0);
    expect(selected()).toEqual(['Product']);
  });

  it('at 270 a swipe up the screen is a swipe left along the strip', () => {
    renderRotated(270);
    drag(item('Product'), 0, -50);
    expect(selected()).toEqual(['Barcode']);
  });

  it('a swipe on the viewfinder is read the same way', () => {
    renderRotated(90);
    drag(screen.getByTestId('scan-viewfinder'), 0, 50);
    expect(selected()).toEqual(['Barcode']);
  });
});

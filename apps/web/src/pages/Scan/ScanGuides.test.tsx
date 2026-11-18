import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { ScanPage } from './ScanPage';

// jsdom has no camera or canvas: the camera hook and image preparation are the seams.
vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
vi.mock('@/lib/image', () => ({
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,AAAA'),
}));

function renderScanWithCalls() {
  const stub = stubApi({
    'POST /api/scan/receipt': () => Response.json({ lines: [] }),
  });
  vi.stubGlobal('fetch', stub.fetchMock);
  renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
    </Routes>,
    { route: '/scan' },
  );
  return stub;
}

function renderScan(
  route = '/scan',
  routes: Parameters<typeof stubApi>[0] = {},
) {
  const { fetchMock } = stubApi(routes);
  vi.stubGlobal('fetch', fetchMock);
  return renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
    </Routes>,
    { route },
  );
}

const guide = () => screen.getByTestId('scan-guide');

/** All CSS emitted into the document, to check rules jsdom cannot evaluate (media queries). */
const cssRules = () =>
  Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('\n');
const classesOf = (el: Element) =>
  Array.from(el.classList).filter((c) => cssRules().includes(`.${c}`));

describe('Scan guides', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each(['Receipt', 'Ingredients', 'Product', 'Plate', 'Barcode'])(
    'morphs to the %s guide when the mode changes',
    async (mode) => {
      renderScan();
      const before = guide().getAttribute('class');
      const user = userEvent.setup();
      await user.click(screen.getByRole('radio', { name: mode }));
      // One guide element throughout: it changes shape in place instead of being replaced.
      expect(guide()).toBeInTheDocument();
      if (mode !== 'Receipt') {
        expect(guide().getAttribute('class')).not.toBe(before);
      }
    },
  );

  it('draws four corner brackets', () => {
    renderScan();
    expect(within(guide()).getAllByTestId('scan-guide-corner')).toHaveLength(4);
  });

  it('morphs the size over 400 ms', () => {
    renderScan();
    const rules = cssRules();
    const className = classesOf(guide()).find((c) =>
      new RegExp(`\\.${c}\\{[^}]*transition:[^;}]*400ms`).test(rules),
    );
    expect(className).toBeDefined();
  });

  it('drops the morph for reduced motion', () => {
    renderScan();
    const rules = cssRules();
    const noTransition = (el: Element) =>
      classesOf(el).some((c) =>
        rules.includes(
          `@media (prefers-reduced-motion: reduce){.${c}{-webkit-transition:none;transition:none;}}`,
        ),
      );
    expect(noTransition(guide())).toBe(true);
    expect(
      noTransition(within(guide()).getAllByTestId('scan-guide-corner')[0]),
    ).toBe(true);
  });
});

describe('The guide takes no input', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is not a button and not in the tab order, in every mode', async () => {
    renderScan();
    for (const mode of [
      'Receipt',
      'Product',
      'Ingredients',
      'Plate',
      'Barcode',
    ]) {
      await userEvent.click(screen.getByRole('radio', { name: mode }));
      expect(guide()).not.toHaveAttribute('role');
      expect(guide()).not.toHaveAttribute('tabindex');
      expect(guide()).toHaveAttribute('aria-hidden', 'true');
      expect(getComputedStyle(guide()).pointerEvents).toBe('none');
    }
    expect(
      screen.queryByRole('button', { name: /double-tap/i }),
    ).not.toBeInTheDocument();
  });

  it('does nothing when double-tapped', async () => {
    const { calls } = renderScanWithCalls();
    const pointer = {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
    };
    for (let i = 0; i < 2; i += 1) {
      fireEvent.pointerDown(guide(), pointer);
      fireEvent.pointerUp(guide(), pointer);
      fireEvent.click(guide(), { detail: 0 });
      fireEvent.keyDown(guide(), { key: 'Enter' });
    }
    await act(async () => {});
    expect(screen.queryByTestId('scan-flash')).toBeNull();
    expect(guide()).not.toHaveAttribute('data-pulse');
    expect(calls.filter((c) => c.key.startsWith('POST /api/scan/'))).toEqual(
      [],
    );
  });

  it('flashes and pulses on a shutter Scan, and its brackets thicken', async () => {
    renderScan('/scan?mode=product');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Take photo' }));
    expect(screen.getByTestId('scan-flash')).toBeInTheDocument();
    expect(guide()).toHaveAttribute('data-pulse', 'true');
    expect(screen.getByTestId('scan-guide-fill')).toBeInTheDocument();
  });
});

describe('Scan guide hint', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([['Receipt'], ['Product'], ['Ingredients'], ['Plate']])(
    'shows no hint under the %s guide (the Info sheet explains the modes)',
    async (mode) => {
      renderScan();
      await userEvent.click(screen.getByRole('radio', { name: mode }));
      expect(screen.queryByTestId('scan-hint')).not.toBeInTheDocument();
      expect(screen.queryByText(/double-tap to scan/)).not.toBeInTheDocument();
    },
  );
});

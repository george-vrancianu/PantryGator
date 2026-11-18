import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { selected, slider } from '@/test/scan';
import { ScanPage } from './ScanPage';

// jsdom has no camera: the camera hook is the seam.
vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);

const CREDITS = {
  balance: 100,
  prices: {
    scan: 1,
    voice: 1,
    assistant: 1,
    'link-page': 2,
    'link-text': 1,
    guidance: 1,
    'plate-recipe': 3,
  },
  lowBalanceThreshold: 10,
  history: [],
};

const ORDER = ['Receipt', 'Ingredients', 'Product', 'Barcode', 'Plate'];

function renderScan(route = '/scan') {
  return renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
    </Routes>,
    { route },
  );
}

const item = (name: string | RegExp) =>
  within(slider()).getByRole('radio', { name });

describe('Scan mode slider', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists Receipt, Ingredients, Product, Barcode, Plate, each named by its mode', () => {
    renderScan();
    expect(
      within(slider())
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(ORDER);
    for (const name of ORDER) expect(item(name)).toBeInTheDocument();
  });

  it('defaults to Receipt when nothing is stored', () => {
    renderScan();
    expect(selected()).toEqual(['Receipt']);
    expect(item('Receipt')).toBeChecked();
  });

  it('selects a mode when its word is tapped', async () => {
    renderScan();
    await userEvent.click(item('Ingredients'));
    expect(selected()).toEqual(['Ingredients']);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Scan ingredients',
    );
  });

  it('moves one mode with the arrow keys and stops at the ends', async () => {
    renderScan();
    await userEvent.keyboard('{ArrowRight}');
    expect(selected()).toEqual(['Ingredients']);
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(selected()).toEqual(['Plate']);
    await userEvent.keyboard('{ArrowRight}');
    expect(selected()).toEqual(['Plate']);
    await userEvent.keyboard('{ArrowLeft}');
    expect(selected()).toEqual(['Barcode']);
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(selected()).toEqual(['Receipt']);
    await userEvent.keyboard('{ArrowLeft}');
    expect(selected()).toEqual(['Receipt']);
  });

  it('announces the new mode when it changes', async () => {
    renderScan();
    await userEvent.click(item('Plate'));
    expect(
      screen.getAllByRole('status').some((r) => r.textContent === 'Plate mode'),
    ).toBe(true);
  });

  it('is a radio group of the five words, only the selected one in the tab order', () => {
    renderScan();
    expect(slider()).toBeInTheDocument();
    expect(within(slider()).getAllByRole('radio')).toHaveLength(5);
    expect(item('Receipt')).toHaveAttribute('tabindex', '0');
    expect(item('Plate')).toHaveAttribute('tabindex', '-1');
  });

  it('the heading follows the mode', async () => {
    renderScan();
    await userEvent.click(item('Barcode'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Scan barcode',
    );
  });

  it('gives the light haptic on a change, not on mount', async () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrate,
      configurable: true,
    });
    try {
      renderScan();
      expect(vibrate).not.toHaveBeenCalled();
      await userEvent.click(item('Product'));
      expect(vibrate).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(navigator, 'vibrate');
    }
  });

  it('works when the browser has no vibration support', async () => {
    renderScan();
    await act(() => userEvent.click(item('Product')));
    expect(selected()).toEqual(['Product']);
  });

  it('restores the last-used mode on the next visit', async () => {
    const first = renderScan();
    await userEvent.click(item('Plate'));
    first.unmount();
    renderScan();
    expect(selected()).toEqual(['Plate']);
  });

  it('lets ?mode= override the last-used mode', async () => {
    const first = renderScan();
    await userEvent.click(item('Plate'));
    first.unmount();
    renderScan('/scan?mode=product');
    expect(selected()).toEqual(['Product']);
  });

  it('ignores an unknown stored mode and falls back to Receipt', () => {
    localStorage.setItem('pocket-pantry.scan-mode', 'sonar');
    renderScan();
    expect(selected()).toEqual(['Receipt']);
  });
});

describe('Scan page opened with its own modes', () => {
  beforeEach(() => localStorage.clear());

  it('starts in the default mode, offers only the given modes, and neither loads nor saves the last mode', () => {
    localStorage.setItem('pocket-pantry.scan-mode', 'plate');
    renderWithProviders(
      <ScanPage
        modes={['product', 'receipt']}
        defaultMode="receipt"
        rememberMode={false}
      />,
    );
    expect(
      within(slider())
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(['Product', 'Receipt']);
    expect(item('Receipt')).toBeChecked();
    expect(localStorage.getItem('pocket-pantry.scan-mode')).toBe('plate');
  });

  describe('Credit Price', () => {
    it('names the price of a Scan on the chosen mode, and none on Barcode', async () => {
      const user = userEvent.setup({ delay: null });
      const { fetchMock } = stubApi({
        'GET /api/credits': () => Response.json(CREDITS),
      });
      vi.stubGlobal('fetch', fetchMock);
      renderScan();
      expect(await within(slider()).findByText('1 Credit')).toBeInTheDocument();
      expect(item(/^Receipt/)).toHaveAccessibleName('Receipt· 1 Credit');
      await user.click(item('Barcode'));
      expect(item('Barcode')).toBeChecked();
      expect(within(slider()).queryByText('1 Credit')).toBeNull();
    });

    it('keeps the Scan price on Plate, not the price of writing the dish', async () => {
      const user = userEvent.setup({ delay: null });
      const { fetchMock } = stubApi({
        'GET /api/credits': () => Response.json(CREDITS),
      });
      vi.stubGlobal('fetch', fetchMock);
      renderScan();
      await user.click(item('Plate'));
      expect(await within(slider()).findByText('1 Credit')).toBeInTheDocument();
      expect(within(slider()).queryByText('3 Credits')).toBeNull();
    });
  });
});

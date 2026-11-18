import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import {
  languageChip,
  pickScanLanguage,
  queryLanguageChip,
  scanLanguagePreference,
  selected,
  takeScan,
} from '@/test/scan';
import { ReviewOverviewPage } from '@/pages/Review/ReviewOverviewPage';
import { ScanPage } from './ScanPage';

vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
const prepared = vi.hoisted(() => ({
  hold: null as null | (() => void),
}));
vi.mock('@/lib/image', () => ({
  resizeImage: () =>
    prepared.hold
      ? new Promise<string>((resolve) => {
          const release = () => resolve('data:image/jpeg;base64,YQ==');
          prepared.hold = release;
        })
      : Promise.resolve('data:image/jpeg;base64,YQ=='),
  cropToReceiptGuide: () => Promise.resolve('data:image/jpeg;base64,Y3JvcA=='),
  cropToReceiptArea: () =>
    Promise.resolve('data:image/jpeg;base64,Z2FsbGVyeQ=='),
}));

const line = {
  name: 'Cheese',
  match: null,
  lowConfidence: false,
  quantity: null,
  unit: null,
  expiryDate: null,
  sourceText: 'OST 200G',
  productDescription: null,
};

function renderScan(
  route = '/scan?mode=product',
  preferred?: 'en' | 'ro' | 'da',
) {
  const { fetchMock, calls } = stubApi({
    ...(preferred ? scanLanguagePreference(preferred) : {}),
    'GET /api/catalog/parents': () => Response.json({ parents: [] }),
    'POST /api/scan/product': () => Response.json({ lines: [line] }),
    'POST /api/pantry/batches/bulk': () => Response.json({ batches: [] }),
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/scan/review" element={<ReviewOverviewPage />} />
      <Route
        path="/"
        element={<Link to="/scan?mode=product">back to the camera</Link>}
      />
    </Routes>,
    { route },
  );
  return calls;
}

const sentLanguages = (calls: { key: string; search?: string }[]) =>
  calls
    .filter((c) => c.key === 'POST /api/scan/product')
    .map((c) => new URLSearchParams(c.search).get('scanLanguage'));

const menu = () => screen.getByRole('menu');
const items = () => within(menu()).getAllByRole('menuitemradio');
const openStack = async () =>
  userEvent.click(await screen.findByRole('button', { name: /^Review \d+ / }));
const file = () => new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
const sendFile = async (testId: string) => {
  await act(async () => {
    fireEvent.change(screen.getByTestId(testId), {
      target: { files: [file()] },
    });
  });
};
const sent = async (calls: Parameters<typeof sentLanguages>[0], n: number) =>
  vi.waitFor(() => expect(sentLanguages(calls)).toHaveLength(n));

describe('Scan Language menu on the Scan screen', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens a menu of English, Română and Dansk in that order, with their codes', async () => {
    renderScan();
    expect(languageChip()).toHaveAttribute('aria-haspopup', 'menu');
    expect(languageChip()).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(languageChip());
    expect(languageChip()).toHaveAttribute('aria-expanded', 'true');
    expect(items().map((i) => i.textContent)).toEqual([
      'English' + 'EN',
      'Română' + 'RO',
      'Dansk' + 'DA',
    ]);
    expect(items().map((i) => i.getAttribute('lang'))).toEqual([
      'en',
      'ro',
      'da',
    ]);
    expect(items().map((i) => i.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
    ]);
  });

  it('focuses the checked item, and the arrow keys, Home and End move between items', async () => {
    renderScan(undefined, 'ro');
    await vi.waitFor(() => expect(languageChip()).toHaveTextContent('RO'));
    await userEvent.click(languageChip());
    expect(screen.getByRole('menuitemradio', { name: 'Română' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'Dansk' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(
      screen.getByRole('menuitemradio', { name: 'English' }),
    ).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitemradio', { name: 'Dansk' })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(
      screen.getByRole('menuitemradio', { name: 'English' }),
    ).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('menuitemradio', { name: 'Dansk' })).toHaveFocus();
  });

  it('picks with Enter or Space, closes, returns focus to the chip and says what it reads in', async () => {
    renderScan();
    await userEvent.click(languageChip());
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(languageChip()).toHaveFocus();
    expect(languageChip()).toHaveTextContent('RO');
    expect(
      (await screen.findByText('Reading in Română')).closest('[role="status"]'),
    ).not.toBeNull();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{ArrowDown}{ArrowDown} ');
    expect(languageChip()).toHaveTextContent('EN');
  });

  it('closes on Escape and returns focus to the chip, without changing anything', async () => {
    renderScan();
    await userEvent.click(languageChip());
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(languageChip()).toHaveFocus();
    expect(languageChip()).toHaveTextContent('EN');
  });

  it('closes on a tap outside the menu', async () => {
    renderScan();
    await userEvent.click(languageChip());
    await userEvent.click(screen.getByTestId('scan-footer'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(languageChip()).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the arrow keys off the camera mode while it is open', async () => {
    renderScan();
    await userEvent.click(languageChip());
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}');
    await userEvent.keyboard('{Escape}');
    expect(selected()).toEqual(['Product']);
    await userEvent.keyboard('{ArrowRight}');
    expect(selected()).toEqual(['Barcode']);
  });

  it('keeps the arrow keys off the camera mode after a click on the menu itself', async () => {
    renderScan();
    await userEvent.click(languageChip());
    await userEvent.click(screen.getByRole('menu'));
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('menu')).toBeVisible();
    expect(selected()).toEqual(['Product']);
  });

  it('is locked while a photo is being prepared', async () => {
    renderScan();
    prepared.hold = () => {};
    takeScan();
    await vi.waitFor(() => expect(languageChip()).toBeDisabled());
    prepared.hold();
    prepared.hold = null;
    await vi.waitFor(() => expect(languageChip()).toBeEnabled());
  });

  it('closes an open menu when the chip gets locked', async () => {
    renderScan();
    await userEvent.click(languageChip());
    expect(screen.getByRole('menu')).toBeVisible();
    prepared.hold = () => {};
    takeScan();
    await vi.waitFor(() => expect(languageChip()).toBeDisabled());
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    prepared.hold();
    prepared.hold = null;
    await vi.waitFor(() => expect(languageChip()).toBeEnabled());
  });

  it.each(['plate', 'barcode'])('is gone in %s', (mode) => {
    renderScan(`/scan?mode=${mode}`);
    expect(queryLanguageChip()).not.toBeInTheDocument();
  });

  it('starts at the preference: with no pick, Scans use it', async () => {
    const calls = renderScan(undefined, 'da');
    await vi.waitFor(() => expect(languageChip()).toHaveTextContent('DA'));
    takeScan();
    await sent(calls, 1);
    expect(sentLanguages(calls)).toEqual(['da']);
  });

  it('a pick applies to every following Scan, shutter and Import, and leaves the Preference alone', async () => {
    const calls = renderScan();
    await pickScanLanguage('Română');
    takeScan();
    await sent(calls, 1);
    await sendFile('import-input');
    await sent(calls, 2);
    expect(sentLanguages(calls)).toEqual(['ro', 'ro']);
    expect(calls.map((c) => c.key)).not.toContain(
      'PUT /api/settings/preferences',
    );
    expect(
      window.localStorage.getItem('pocket-pantry.scan-language'),
    ).toBeNull();
  });
});

describe('Scan Language across the Scan Session', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  async function toReview() {
    takeScan();
    await openStack();
    await screen.findByTestId('review-photos-input');
  }

  it('applies to Add from photos in Review and survives Take more', async () => {
    const calls = renderScan(undefined, 'da');
    await vi.waitFor(() => expect(languageChip()).toHaveTextContent('DA'));
    await pickScanLanguage('Română');
    await toReview();
    await sendFile('review-photos-input');
    await sent(calls, 2);
    await userEvent.click(screen.getByRole('button', { name: 'Take more' }));
    expect(languageChip()).toHaveTextContent('RO');
    takeScan();
    await sent(calls, 3);
    expect(sentLanguages(calls)).toEqual(['ro', 'ro', 'ro']);
  });

  it('is dropped by Discard all: the next Session starts at the preference', async () => {
    const calls = renderScan(undefined, 'da');
    await vi.waitFor(() => expect(languageChip()).toHaveTextContent('DA'));
    await pickScanLanguage('Română');
    await toReview();
    await userEvent.click(screen.getByRole('button', { name: 'Discard all' }));
    expect(await screen.findByTestId('scan-top-bar')).toBeVisible();
    expect(languageChip()).toHaveTextContent('DA');
    takeScan();
    await sent(calls, 2);
    expect(sentLanguages(calls)).toEqual(['ro', 'da']);
  });

  it('is dropped by Add all', async () => {
    renderScan(undefined, 'ro');
    await pickScanLanguage('Dansk');
    await toReview();
    await userEvent.click(
      await screen.findByRole('button', { name: /^Add all/ }),
    );
    expect(await screen.findByTestId('scan-top-bar')).toBeVisible();
    expect(languageChip()).toHaveTextContent('RO');
  });

  it('is dropped by Close, after confirming the discard', async () => {
    renderScan(undefined, 'ro');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await pickScanLanguage('Dansk');
    takeScan();
    await screen.findByRole('button', { name: /^Review \d+ / });
    await userEvent.click(
      screen.getByRole('button', { name: 'Close scanner' }),
    );
    await userEvent.click(
      await screen.findByRole('link', { name: 'back to the camera' }),
    );
    expect(languageChip()).toHaveTextContent('RO');
  });

  it('is dropped by Close with no Scans taken', async () => {
    renderScan(undefined, 'ro');
    await pickScanLanguage('Dansk');
    expect(languageChip()).toHaveTextContent('DA');
    await userEvent.click(
      screen.getByRole('button', { name: 'Close scanner' }),
    );
    await userEvent.click(
      await screen.findByRole('link', { name: 'back to the camera' }),
    );
    expect(languageChip()).toHaveTextContent('RO');
  });

  it('is kept when the Member declines to discard on Close', async () => {
    renderScan();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await pickScanLanguage('Dansk');
    takeScan();
    await screen.findByRole('button', { name: /^Review \d+ / });
    await userEvent.click(
      screen.getByRole('button', { name: 'Close scanner' }),
    );
    expect(languageChip()).toHaveTextContent('DA');
  });
});

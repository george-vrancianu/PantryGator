import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { dispatchScanSession, resetScanSession } from '@/lib/scanSession';
import { ScanPage } from './ScanPage';
import { fakeCamera, pickScanLanguage, queryLanguageChip } from '@/test/scan';

vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);

function renderScan(route = '/scan?mode=product') {
  renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/" element={<p data-testid="home">Home</p>} />
    </Routes>,
    { route },
  );
}
const bar = () => within(screen.getByTestId('scan-top-bar'));
const chip = () => queryLanguageChip();

describe('The Scan page top bar', () => {
  beforeEach(() => {
    localStorage.clear();
    resetScanSession();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('holds Close, torch, the Scan Language chip and Info, and no Done or gallery button', () => {
    renderScan();
    for (const name of ['Close scanner', /^Torch/, 'How scanning works']) {
      expect(bar().getByRole('button', { name })).toBeInTheDocument();
    }
    expect(bar().getByRole('button', { name: /Reading as/ })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^Done|Choose from photos/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('scan-thumbnail')).not.toBeInTheDocument();
  });

  it('shows the torch only when the camera has one, and lights it when on', async () => {
    renderScan();
    const torch = bar().getByRole('button', { name: 'Torch' });
    expect(torch).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(torch);
    expect(torch).toHaveAttribute('aria-pressed', 'true');
  });

  it('has no torch button when the camera has no torch', () => {
    fakeCamera.torchSupported = false;
    renderScan();
    expect(bar().queryByRole('button', { name: /^Torch/ })).toBeNull();
  });

  it('closes without asking when the Scan Session is empty', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    renderScan();
    await userEvent.click(bar().getByRole('button', { name: 'Close scanner' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByTestId('home')).toBeInTheDocument();
  });

  it('asks "Discard N photos?" when the Scan Session has cards, and stays if declined', async () => {
    dispatchScanSession({
      type: 'enqueue',
      scan: { id: 'a', mode: 'product', image: 'i', thumbnail: 'i' },
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderScan();
    await userEvent.click(bar().getByRole('button', { name: 'Close scanner' }));
    expect(confirm).toHaveBeenCalledWith('Discard 1 photo?');
    expect(screen.queryByTestId('home')).toBeNull();
    confirm.mockReturnValue(true);
    await userEvent.click(bar().getByRole('button', { name: 'Close scanner' }));
    expect(screen.getByTestId('home')).toBeInTheDocument();
  });

  it.each(['plate', 'barcode'])(
    'hides the Scan Language chip in %s and takes it out of the tab order',
    (mode) => {
      renderScan(`/scan?mode=${mode}`);
      expect(chip()).toBeNull();
    },
  );

  it('still changes the Scan Language from the chip', async () => {
    renderScan();
    await pickScanLanguage('Română');
    expect(chip()).toHaveTextContent('RO');
  });

  it('opens the Info sheet with the shutter copy', async () => {
    renderScan();
    await userEvent.click(
      bar().getByRole('button', { name: 'How scanning works' }),
    );
    const sheet = screen.getByRole('dialog', { name: 'Scanning your pantry' });
    expect(sheet).toHaveTextContent(/tap the shutter/);
    expect(sheet).toHaveTextContent(/tap the photos at the bottom left/);
    expect(within(sheet).getByRole('button', { name: 'Got it' })).toBeVisible();
  });
});

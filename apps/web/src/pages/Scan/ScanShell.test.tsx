import { THEMES } from '@pocket-pantry/ui';
import { shutter, fakeCamera, setStatus } from '@/test/scan';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paintedColour } from '@pocket-pantry/ui/test/colour';
import { renderWithProviders } from '@/test/render';
import { ScanPage } from './ScanPage';

// jsdom has no camera: the camera hook is the seam. `starts`/`stops` of the fake camera show whether the
// stream was stopped or restarted (mount/unmount of the hook) while the Info sheet was open.
vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);

const DARK = THEMES.dark;

function renderScan() {
  return renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
    </Routes>,
    { route: '/scan' },
  );
}

describe('Scan screen shell', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the camera as unavailable when its status flips mid-test', () => {
    renderScan();
    expect(screen.queryByText(/The camera is not available/)).toBeNull();
    setStatus('unavailable');
    expect(screen.getByText(/The camera is not available/)).toBeInTheDocument();
    setStatus('ready');
    expect(screen.queryByText(/The camera is not available/)).toBeNull();
  });

  it('is a full-screen, non-scrolling surface', () => {
    renderScan();
    const shell = screen.getByTestId('scan-screen');
    const style = getComputedStyle(shell);
    expect(style.position).toBe('fixed');
    expect(style.overflow).toBe('hidden');
  });

  it.each(['light'] as const)('renders in Dark under the %s Theme', (theme) => {
    localStorage.setItem(
      'pp.appearance',
      JSON.stringify({ theme, matchSystem: false }),
    );
    renderScan();
    const shell = screen.getByTestId('scan-screen');
    expect(document.documentElement.dataset.theme).toBe(theme);
    expect(shell).toHaveAttribute('data-theme', 'dark');
    expect(paintedColour(shell, 'background-color')).toBe(DARK.bg);
    expect(paintedColour(shell, 'color')).toBe(DARK.ink);
  });

  it("paints the browser chrome in Dark's bg while open, then the root Theme's", () => {
    localStorage.setItem(
      'pp.appearance',
      JSON.stringify({ theme: 'light', matchSystem: false }),
    );
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
    const { unmount } = renderScan();
    expect(meta.content).toBe(DARK.bg);
    unmount();
    expect(meta.content).toBe(THEMES.light.bg);
    meta.remove();
  });

  it("leaves the rest of the app in the Member's Theme after closing", async () => {
    localStorage.setItem(
      'pp.appearance',
      JSON.stringify({ theme: 'light', matchSystem: false }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/" element={<p data-testid="home">Home</p>} />
      </Routes>,
      { route: '/scan' },
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Close scanner' }),
    );
    const home = screen.getByTestId('home');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.querySelector('[data-theme="dark"]')).toBeNull();
    expect(paintedColour(home, 'color')).toBe(THEMES.light.ink);
  });

  it('shows the torch button in the top bar when the camera has a torch', () => {
    renderScan();
    const bar = screen.getByTestId('scan-top-bar');
    expect(
      within(bar).getByRole('button', { name: /^Torch/ }),
    ).toBeInTheDocument();
    expect(
      within(bar).getByRole('button', { name: 'How scanning works' }),
    ).toBeInTheDocument();
  });

  it('hides the torch button when the camera has no torch', () => {
    fakeCamera.torchSupported = false;
    renderScan();
    expect(
      screen.queryByRole('button', { name: /^Torch/ }),
    ).not.toBeInTheDocument();
  });

  it('opens the Info sheet from Info and dismisses it on a scrim tap', async () => {
    renderScan();
    expect(
      screen.queryByRole('dialog', { name: 'Scanning your pantry' }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'How scanning works' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Scanning your pantry' }),
    ).toBeInTheDocument();
    await userEvent.click(
      document.querySelector<HTMLElement>('.MuiBackdrop-root')!,
    );
    expect(
      screen.queryByRole('dialog', { name: 'Scanning your pantry' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the camera running while the Info sheet is open', async () => {
    renderScan();
    const startsBefore = fakeCamera.starts;
    await userEvent.click(
      screen.getByRole('button', { name: 'How scanning works' }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(fakeCamera.stops).toBe(0);
    expect(fakeCamera.starts).toBe(startsBefore);
    // Behind the open Sheet the shutter is aria-hidden.
    expect(
      screen.getByRole('button', { name: 'Take photo', hidden: true }),
    ).not.toHaveAttribute('aria-disabled');
  });
});

describe('camera feed and overlays', () => {
  const pinned = (el: HTMLElement) => {
    const shell = screen.getByTestId('scan-screen');
    for (let n = el.parentElement; n && n !== shell; n = n.parentElement) {
      if (['absolute', 'fixed'].includes(getComputedStyle(n).position)) {
        return true;
      }
    }
    return ['absolute', 'fixed'].includes(getComputedStyle(el).position);
  };

  it('fills the screen with an aspect-filled feed behind the controls', () => {
    renderScan();
    const feed = screen.getByTestId('scan-feed');
    const style = getComputedStyle(feed);
    expect(feed.tagName).toBe('VIDEO');
    expect(feed.parentElement).toBe(screen.getByTestId('scan-viewfinder'));
    expect(screen.getByTestId('scan-viewfinder').parentElement).toBe(
      screen.getByTestId('scan-screen'),
    );
    expect(style.objectFit).toBe('cover');
    expect(style.position).toBe('absolute');
    expect(style.width).toBe('100%');
    expect(style.height).toBe('100%');
  });

  it('lays a radial vignette from transparent to 45% Dark background over the feed', () => {
    renderScan();
    const vignette = screen.getByTestId('scan-vignette');
    const style = getComputedStyle(vignette);
    expect(style.backgroundImage).toContain('radial-gradient');
    expect(paintedColour(vignette, 'background-image')).toContain(
      `${DARK.bg} 45%`,
    );
    expect(style.pointerEvents).toBe('none');
  });

  it('pins the shutter and the mode slider over the feed so they stay reachable', () => {
    renderScan();
    expect(pinned(shutter())).toBe(true);
    expect(pinned(screen.getByRole('radiogroup', { name: 'Scan mode' }))).toBe(
      true,
    );
  });
});

describe('Info sheet accessibility', () => {
  const infoButton = () =>
    screen.getByRole('button', { name: 'How scanning works' });

  it('returns focus to the Info button when the sheet closes', async () => {
    renderScan();
    await userEvent.click(infoButton());
    await userEvent.click(
      document.querySelector<HTMLElement>('.MuiBackdrop-root')!,
    );
    expect(infoButton()).toHaveFocus();
  });

  it('closes on Escape', async () => {
    renderScan();
    await userEvent.click(infoButton());
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(infoButton()).toHaveFocus();
  });
});

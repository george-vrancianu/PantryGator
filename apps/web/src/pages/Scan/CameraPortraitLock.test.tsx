import { ScreenOrientation } from '@capacitor/screen-orientation';
import { act, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { stubScreen } from '../../test/screen';
import { Where } from '../../test/intro';
import { IntroCameraPage } from '../Intro/IntroCameraPage';
import { ScanPage } from './ScanPage';

// While a camera is open on a phone in the app the screen is locked to portrait (ADR 0037). The
// add-Batch camera is covered in pages/Pantry/AddBatchPortraitLock.test.tsx.
vi.mock('../../lib/camera', async () =>
  (await import('../../test/scan')).fakeCameraModule(),
);
vi.mock('@capacitor/screen-orientation', () => ({
  ScreenOrientation: {
    lock: vi.fn(() => Promise.resolve()),
    unlock: vi.fn(() => Promise.resolve()),
  },
}));

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };

const cameras = [
  ['the Scan page', '/scan?mode=product'],
  ['the Intro camera', '/intro/camera?mode=ingredients'],
] as const;

function renderCamera(route: string) {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/intro/camera" element={<IntroCameraPage />} />
        <Route path="/intro/snap" element={<p>Snap</p>} />
        <Route path="/" element={<p>Home</p>} />
        <Route path="/elsewhere" element={<p>Elsewhere</p>} />
      </Routes>
      <Link to="/elsewhere">Leave</Link>
      <Where />
    </>,
    { route },
  );
}

describe.each(cameras)('Portrait lock in %s', (_name, route) => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('locks to portrait on a phone in the app, and not before', () => {
    stubScreen({ ...PHONE, native: true });
    renderCamera('/elsewhere');
    expect(ScreenOrientation.lock).not.toHaveBeenCalled();
    cleanup();
    renderCamera(route);
    expect(ScreenOrientation.lock).toHaveBeenCalledExactlyOnceWith({
      orientation: 'portrait',
    });
    expect(ScreenOrientation.unlock).not.toHaveBeenCalled();
  });

  it('unlocks on Close', async () => {
    stubScreen({ ...PHONE, native: true });
    renderCamera(route);
    await userEvent.click(
      screen.getByRole('button', { name: 'Close scanner' }),
    );
    expect(screen.queryByTestId('scan-screen')).toBeNull();
    expect(ScreenOrientation.unlock).toHaveBeenCalledOnce();
  });

  it('unlocks when the route changes under the camera', async () => {
    stubScreen({ ...PHONE, native: true });
    renderCamera(route);
    await userEvent.click(screen.getByRole('link', { name: 'Leave' }));
    expect(screen.getByText('Elsewhere')).toBeInTheDocument();
    expect(ScreenOrientation.unlock).toHaveBeenCalledOnce();
  });

  it('unlocks on unmount', () => {
    stubScreen({ ...PHONE, native: true });
    renderCamera(route).unmount();
    expect(ScreenOrientation.unlock).toHaveBeenCalledOnce();
  });

  it('never locks a tablet in the app', async () => {
    stubScreen({ ...TABLET, native: true });
    const view = renderCamera(route);
    await userEvent.click(
      screen.getByRole('button', { name: 'Close scanner' }),
    );
    view.unmount();
    expect(ScreenOrientation.lock).not.toHaveBeenCalled();
    expect(ScreenOrientation.unlock).not.toHaveBeenCalled();
  });

  it.each([
    ['phone', PHONE],
    ['tablet', TABLET],
  ])('never calls the plugin on the web, on a %s', async (_kind, size) => {
    stubScreen({ ...size, native: false });
    const view = renderCamera(route);
    await act(async () => {});
    await userEvent.click(
      screen.getByRole('button', { name: 'Close scanner' }),
    );
    view.unmount();
    expect(ScreenOrientation.lock).not.toHaveBeenCalled();
    expect(ScreenOrientation.unlock).not.toHaveBeenCalled();
  });
});

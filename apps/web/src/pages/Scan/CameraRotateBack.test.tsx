import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_PREPARATION } from '../../lib/scanImage';
import { resetScanSession } from '../../lib/scanSession';
import { renderWithProviders } from '../../test/render';
import { shutter, takeScan } from '../../test/scan';
import { stubScreen } from '../../test/screen';
import { IntroCameraPage } from '../Intro/IntroCameraPage';
import { ScanPage } from './ScanPage';
import { CameraFrame } from '../../components/camera/CameraFrame';
import { CameraToast } from '../../components/camera/CameraToast';

// On a phone on the web the camera chrome is rotated back by the opposite angle and the photo is
// turned by the angle captured at the shutter (ADR 0037). The add-Batch camera is covered in
// pages/Pantry/AddBatchRotateBack.test.tsx.
vi.mock('../../lib/camera', async () =>
  (await import('../../test/scan')).fakeCameraModule(),
);
vi.mock('../../lib/scanImage', () => {
  const prepare = vi.fn(() => Promise.resolve('data:image/jpeg;base64,YQ=='));
  return {
    IMAGE_PREPARATION: {
      product: prepare,
      receipt: prepare,
      plate: prepare,
      ingredients: prepare,
    },
  };
});
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
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  );
  return renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/intro/camera" element={<IntroCameraPage />} />
    </Routes>,
    { route },
  );
}

const frame = () => screen.getByTestId('camera-frame');
const turned = () => frame().style.transform;

describe.each(cameras)('Rotate back in %s', (_name, route) => {
  beforeEach(() => {
    localStorage.clear();
    resetScanSession();
    vi.mocked(IMAGE_PREPARATION.product).mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('leaves the chrome alone at angle 0', () => {
    stubScreen({ ...PHONE });
    renderCamera(route);
    expect(frame()).toHaveAttribute('data-rotate-back', '0');
    expect(turned()).toBe('');
  });

  it.each([
    [90, 'rotate(-90deg)'],
    [270, 'rotate(-270deg)'],
  ] as const)(
    'turns the chrome back by the opposite angle at %i, in a portrait-sized box',
    (angle, expected) => {
      const s = stubScreen({ ...PHONE });
      renderCamera(route);
      act(() => s.rotate(angle));
      expect(frame()).toHaveAttribute('data-rotate-back', String(angle));
      expect(turned()).toContain(expected);
      // The window is 844 x 390 now; the chrome's box is the phone's portrait 390 x 844.
      expect(frame().style.width).toBe('390px');
      expect(frame().style.height).toBe('844px');
    },
  );

  it('turns the chrome back by 180 upside-down', () => {
    const s = stubScreen({ ...PHONE });
    renderCamera(route);
    act(() => s.setAngle(180));
    expect(turned()).toBe('rotate(-180deg)');
  });

  it('holds the bars, the guide and the sheets inside the turned box, and the video outside', async () => {
    const s = stubScreen({ ...PHONE });
    renderCamera(route);
    act(() => s.rotate(90));
    for (const id of ['scan-top-bar', 'scan-footer', 'scan-guide']) {
      expect(frame()).toContainElement(screen.getByTestId(id));
    }
    expect(frame()).toContainElement(
      screen.getByRole('button', { name: 'Take photo' }),
    );
    expect(frame()).not.toContainElement(screen.getByTestId('scan-feed'));
    await userEvent.click(
      screen.getByRole('button', { name: 'How scanning works' }),
    );
    expect(frame()).toContainElement(screen.getByTestId('info-scrim'));
  });

  it('holds the Scan Language menu inside the turned box', async () => {
    const s = stubScreen({ ...PHONE });
    renderCamera(route);
    act(() => s.rotate(90));
    await userEvent.click(screen.getByRole('button', { name: /Reading/ }));
    expect(frame()).toContainElement(screen.getByRole('menu'));
  });

  it('follows a rotation while the camera is open, and back to upright', () => {
    const s = stubScreen({ ...PHONE });
    renderCamera(route);
    act(() => s.rotate(90));
    expect(turned()).toContain('rotate(-90deg)');
    act(() => s.rotate(0));
    expect(turned()).toBe('');
    act(() => s.rotate(270));
    expect(turned()).toContain('rotate(-270deg)');
  });

  it('swipes along the screen-vertical on the viewfinder at 90 and 270', () => {
    const s = stubScreen({ ...PHONE });
    renderCamera(route);
    const surface = () =>
      (screen.queryByTestId('scan-viewfinder') ??
        screen.getByTestId('camera-overlay').firstElementChild) as HTMLElement;
    expect(getComputedStyle(surface()).touchAction).toBe('pan-y');
    act(() => s.rotate(90));
    expect(getComputedStyle(surface()).touchAction).toBe('pan-x');
    act(() => s.rotate(180));
    expect(getComputedStyle(surface()).touchAction).toBe('pan-y');
  });

  it('never rotates back in the app', () => {
    const s = stubScreen({ ...PHONE, native: true });
    renderCamera(route);
    act(() => s.rotate(90));
    expect(frame()).toHaveAttribute('data-rotate-back', '0');
    expect(turned()).toBe('');
  });

  it('never rotates back on a tablet', () => {
    const s = stubScreen({ ...TABLET });
    renderCamera(route);
    act(() => s.rotate(90));
    expect(frame()).toHaveAttribute('data-rotate-back', '0');
    expect(turned()).toBe('');
  });

  it('stops following once the camera is closed', async () => {
    const s = stubScreen({ ...PHONE });
    const view = renderCamera(route);
    view.unmount();
    expect(() => act(() => s.rotate(90))).not.toThrow();
  });

  it.each([0, 90, 180, 270] as const)(
    'hands the photo the angle captured at the shutter (%i) and the guide in the portrait frame',
    async (angle) => {
      const s = stubScreen({ ...PHONE });
      renderCamera(route);
      if (angle === 90 || angle === 270) act(() => s.rotate(angle));
      else act(() => s.setAngle(angle));
      await waitFor(() =>
        expect(shutter()).not.toHaveAttribute('aria-disabled'),
      );
      takeScan();
      await waitFor(() =>
        expect(IMAGE_PREPARATION.product).toHaveBeenCalledOnce(),
      );
      expect(IMAGE_PREPARATION.product).toHaveBeenCalledWith(
        expect.any(Blob),
        'camera',
        expect.objectContaining({ width: 390, height: 844 }),
        angle,
      );
    },
  );

  it('keeps the angle from the shutter if the phone turns while the photo is taken', async () => {
    const s = stubScreen({ ...PHONE });
    renderCamera(route);
    act(() => s.rotate(90));
    await waitFor(() => expect(shutter()).not.toHaveAttribute('aria-disabled'));
    takeScan();
    act(() => s.rotate(0));
    await waitFor(() =>
      expect(IMAGE_PREPARATION.product).toHaveBeenCalledOnce(),
    );
    expect(vi.mocked(IMAGE_PREPARATION.product).mock.calls[0]?.[3]).toBe(90);
  });

  it('gives the photo no turn in the app', async () => {
    const s = stubScreen({ ...PHONE, native: true });
    renderCamera(route);
    act(() => s.rotate(90));
    await waitFor(() => expect(shutter()).not.toHaveAttribute('aria-disabled'));
    takeScan();
    await waitFor(() =>
      expect(IMAGE_PREPARATION.product).toHaveBeenCalledOnce(),
    );
    expect(vi.mocked(IMAGE_PREPARATION.product).mock.calls[0]?.[3]).toBe(0);
  });
});

describe('A toast in the turned camera frame', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function renderToast() {
    return renderWithProviders(
      <CameraFrame>
        <CameraToast open onClose={() => {}}>
          Saved
        </CameraToast>
      </CameraFrame>,
    );
  }
  const snackbar = () =>
    screen.getByText('Saved').closest<HTMLElement>('.MuiSnackbar-root')!;

  /**
   * The frame's own rule for a Snackbar inside it, if the stylesheet has one. jsdom ignores
   * @media and has no layout, so the placement itself cannot be measured: this pins the rule
   * that overrides MUI's `sm` centring, found by any of the frame's classes.
   */
  function frameSnackbarRule(): CSSStyleRule | undefined {
    const classes = Array.from(frame().classList);
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules)) {
        if (
          rule instanceof CSSStyleRule &&
          rule.selectorText.includes('.MuiSnackbar-root') &&
          classes.some((name) => rule.selectorText.includes(`.${name}`))
        ) {
          return rule;
        }
      }
    }
    return undefined;
  }

  it.each([90, 270] as const)(
    'sits inside the frame and is set to fill its width at %i degrees, not centred on the landscape window',
    (angle) => {
      const s = stubScreen({ ...PHONE });
      renderToast();
      act(() => s.rotate(angle));
      expect(frame()).toContainElement(snackbar());
      const rule = frameSnackbarRule();
      expect(rule?.style.left).toBe('8px');
      expect(rule?.style.right).toBe('8px');
      expect(rule?.style.transform).toBe('none');
    },
  );

  it('leaves the Snackbar to MUI where the frame is not turned', () => {
    stubScreen({ ...PHONE });
    renderToast();
    expect(frameSnackbarRule()).toBeUndefined();
  });
});

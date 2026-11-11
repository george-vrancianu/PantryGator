import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubScreen } from '../test/screen';
import {
  cameraConstraints,
  clampZoom,
  FOCUS_POINT_Y,
  useCamera,
} from './camera';

describe('cameraConstraints', () => {
  it('asks for the rear camera at an ideal (never exact) 1080p, in every Scan Mode', () => {
    expect(cameraConstraints()).toEqual({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
  });
});

describe('barcode detection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('./barcodeDecoder');
    vi.resetModules();
  });

  const video = { readyState: 4 } as HTMLVideoElement;

  it('uses the browser BarcodeDetector where it reads all four formats, without loading the ponyfill', async () => {
    const ponyfill = vi.fn();
    vi.doMock('./barcodeDecoder', () => {
      ponyfill();
      return { createZXingDetector: vi.fn() };
    });
    const formats: string[][] = [];
    class Native {
      static getSupportedFormats = () =>
        Promise.resolve(['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code']);
      constructor(options: { formats: string[] }) {
        formats.push(options.formats);
      }
      detect = () => Promise.resolve([{ rawValue: '3017620422003' }]);
    }
    vi.stubGlobal('BarcodeDetector', Native);
    const { readBarcode } = await import('./camera');
    expect(await readBarcode(video)).toBe('3017620422003');
    expect(formats).toEqual([['ean_13', 'ean_8', 'upc_a', 'upc_e']]);
    expect(ponyfill).not.toHaveBeenCalled();
  });

  it('loads the ZXing ponyfill only on first use, when the browser has no detector', async () => {
    const ponyfill = vi.fn();
    vi.doMock('./barcodeDecoder', () => {
      ponyfill();
      return {
        createZXingDetector: () => ({
          detect: () => Promise.resolve([{ rawValue: '12345670' }]),
        }),
      };
    });
    const { readBarcode } = await import('./camera');
    expect(ponyfill).not.toHaveBeenCalled();
    expect(await readBarcode(video)).toBe('12345670');
    expect(ponyfill).toHaveBeenCalledTimes(1);
  });

  it('ignores a code that is not an EAN/UPC length', async () => {
    vi.doMock('./barcodeDecoder', () => ({
      createZXingDetector: () => ({
        detect: () => Promise.resolve([{ rawValue: '123' }]),
      }),
    }));
    const { readBarcode } = await import('./camera');
    expect(await readBarcode(video)).toBeNull();
  });

  it.each(['3017620422004', '036000291453'])(
    'ignores the misread %s, whose check digit is wrong, and takes the next code',
    async (misread) => {
      vi.doMock('./barcodeDecoder', () => ({
        createZXingDetector: () => ({
          detect: () =>
            Promise.resolve([
              { rawValue: misread },
              { rawValue: '036000291452' },
            ]),
        }),
      }));
      const { readBarcode } = await import('./camera');
      expect(await readBarcode(video)).toBe('036000291452');
    },
  );

  it.each(['96385075', '04252615'])(
    'ignores the 8-digit misread %s',
    async (misread) => {
      vi.doMock('./barcodeDecoder', () => ({
        createZXingDetector: () => ({
          detect: () => Promise.resolve([{ rawValue: misread }]),
        }),
      }));
      const { readBarcode } = await import('./camera');
      expect(await readBarcode(video)).toBeNull();
    },
  );

  it('reads a valid UPC-E', async () => {
    vi.doMock('./barcodeDecoder', () => ({
      createZXingDetector: () => ({
        detect: () => Promise.resolve([{ rawValue: '04252614' }]),
      }),
    }));
    const { readBarcode } = await import('./camera');
    expect(await readBarcode(video)).toBe('04252614');
  });
});

describe('focusForScan', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  async function openCamera(capabilities: object | undefined) {
    const applyConstraints = vi.fn(() => Promise.resolve());
    const track: Record<string, unknown> = {
      getCapabilities: capabilities ? () => capabilities : undefined,
      applyConstraints,
      stop: vi.fn(),
    };
    const stream = {
      getVideoTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: () => Promise.resolve(stream) },
      configurable: true,
    });
    const hook = renderHook(() => useCamera());
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    return { hook, applyConstraints, track };
  }

  const settled = (promise: Promise<void>) => {
    const state = { done: false };
    void promise.then(() => (state.done = true));
    return state;
  };

  it.each([
    [90, { x: FOCUS_POINT_Y, y: 0.5 }],
    [180, { x: 0.5, y: 1 - FOCUS_POINT_Y }],
    [270, { x: 1 - FOCUS_POINT_Y, y: 0.5 }],
  ] as const)(
    "with the screen turned to %i it aims where the guide is on screen, in the video's own coordinates",
    async (angle, expected) => {
      stubScreen({ width: 390, height: 844, angle });
      const { hook, applyConstraints } = await openCamera({
        focusMode: ['manual', 'single-shot', 'continuous'],
      });
      vi.useFakeTimers();
      act(() => {
        hook.result.current.focusForScan().cancel();
      });
      expect(applyConstraints).toHaveBeenNthCalledWith(1, {
        advanced: [{ focusMode: 'single-shot', pointsOfInterest: [expected] }],
      });
    },
  );

  it('aims at the guide centre it is given, not the default point', async () => {
    const { hook, applyConstraints } = await openCamera({
      focusMode: ['manual', 'single-shot', 'continuous'],
    });
    vi.useFakeTimers();
    act(() => {
      hook.result.current.focusForScan({ x: 0.43, y: 0.53 }).cancel();
    });
    expect(applyConstraints).toHaveBeenNthCalledWith(1, {
      advanced: [
        {
          focusMode: 'single-shot',
          pointsOfInterest: [{ x: 0.43, y: 0.53 }],
        },
      ],
    });
  });

  it('aims at the centre of the guide as it is in the app, where nothing is rotated back', async () => {
    stubScreen({ width: 390, height: 844, angle: 90, native: true });
    const { hook, applyConstraints } = await openCamera({
      focusMode: ['manual', 'single-shot', 'continuous'],
    });
    vi.useFakeTimers();
    act(() => {
      hook.result.current.focusForScan().cancel();
    });
    expect(applyConstraints).toHaveBeenNthCalledWith(1, {
      advanced: [
        {
          focusMode: 'single-shot',
          pointsOfInterest: [{ x: 0.5, y: FOCUS_POINT_Y }],
        },
      ],
    });
  });

  it('where single-shot focus exists, focuses on the guide centre, then returns to continuous', async () => {
    const { hook, applyConstraints } = await openCamera({
      focusMode: ['manual', 'single-shot', 'continuous'],
    });
    vi.useFakeTimers();
    let pass!: ReturnType<typeof hook.result.current.focusForScan>;
    act(() => {
      pass = hook.result.current.focusForScan();
    });
    expect(applyConstraints).toHaveBeenNthCalledWith(1, {
      advanced: [
        {
          focusMode: 'single-shot',
          pointsOfInterest: [{ x: 0.5, y: FOCUS_POINT_Y }],
        },
      ],
    });
    await act(() => vi.advanceTimersByTimeAsync(400));
    await act(() => pass.done);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(applyConstraints).toHaveBeenLastCalledWith({
      advanced: [{ focusMode: 'continuous' }],
    });
  });

  it('does not finish on the instant applyConstraints resolves, but after the 400 ms pause, and returns to continuous only after finishing', async () => {
    const { hook, applyConstraints } = await openCamera({
      focusMode: ['single-shot'],
    });
    vi.useFakeTimers();
    let pass!: ReturnType<typeof hook.result.current.focusForScan>;
    act(() => {
      pass = hook.result.current.focusForScan();
    });
    const state = settled(pass.done);
    await act(() => vi.advanceTimersByTimeAsync(399));
    expect(state.done).toBe(false);
    expect(applyConstraints).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(state.done).toBe(true);
    expect(applyConstraints).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(applyConstraints).toHaveBeenLastCalledWith({
      advanced: [{ focusMode: 'continuous' }],
    });
  });

  it('goes back to continuous even when the camera was in another mode', async () => {
    const { hook, applyConstraints, track } = await openCamera({
      focusMode: ['single-shot', 'manual'],
    });
    // Guards against a regression to restoring the previous focus mode.
    track.getSettings = () => ({ focusMode: 'manual' });
    let pass!: ReturnType<typeof hook.result.current.focusForScan>;
    act(() => {
      pass = hook.result.current.focusForScan();
    });
    await act(async () => pass.cancel());
    expect(applyConstraints).toHaveBeenLastCalledWith({
      advanced: [{ focusMode: 'continuous' }],
    });
  });

  it('goes back to continuous when the hold is cancelled', async () => {
    const { hook, applyConstraints } = await openCamera({
      focusMode: ['single-shot', 'continuous'],
    });
    let pass!: ReturnType<typeof hook.result.current.focusForScan>;
    act(() => {
      pass = hook.result.current.focusForScan();
    });
    await act(async () => pass.cancel());
    expect(applyConstraints).toHaveBeenLastCalledWith({
      advanced: [{ focusMode: 'continuous' }],
    });
  });

  it('still finishes and goes back to continuous when the single-shot request is rejected', async () => {
    const { hook, applyConstraints } = await openCamera({
      focusMode: ['single-shot', 'continuous'],
    });
    applyConstraints.mockRejectedValueOnce(new Error('refused'));
    vi.useFakeTimers();
    let pass!: ReturnType<typeof hook.result.current.focusForScan>;
    act(() => {
      pass = hook.result.current.focusForScan();
    });
    await act(() => pass.done);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(applyConstraints).toHaveBeenLastCalledWith({
      advanced: [{ focusMode: 'continuous' }],
    });
  });

  it('gives up waiting for focus after about 1 s and still finishes', async () => {
    const { hook, applyConstraints } = await openCamera({
      focusMode: ['single-shot'],
    });
    applyConstraints.mockImplementationOnce(() => new Promise(() => {}));
    vi.useFakeTimers();
    let pass!: ReturnType<typeof hook.result.current.focusForScan>;
    act(() => {
      pass = hook.result.current.focusForScan();
    });
    const state = settled(pass.done);
    await act(() => vi.advanceTimersByTimeAsync(999));
    expect(state.done).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(2));
    expect(state.done).toBe(true);
    expect(applyConstraints).toHaveBeenLastCalledWith({
      advanced: [{ focusMode: 'continuous' }],
    });
  });

  it('without single-shot (or without capabilities) only pauses about 400 ms and touches no constraints', async () => {
    for (const capabilities of [{ focusMode: ['continuous'] }, {}, undefined]) {
      const { hook, applyConstraints } = await openCamera(capabilities);
      vi.useFakeTimers();
      let pass!: ReturnType<typeof hook.result.current.focusForScan>;
      act(() => {
        pass = hook.result.current.focusForScan();
      });
      const state = settled(pass.done);
      await act(() => vi.advanceTimersByTimeAsync(399));
      expect(state.done).toBe(false);
      await act(() => vi.advanceTimersByTimeAsync(2));
      expect(state.done).toBe(true);
      expect(applyConstraints).not.toHaveBeenCalled();
      vi.useRealTimers();
      hook.unmount();
    }
  });
});

describe('zoom', () => {
  afterEach(() => Reflect.deleteProperty(navigator, 'mediaDevices'));

  async function openCamera(capabilities: object | undefined) {
    const applyConstraints = vi.fn(() => Promise.resolve());
    const track = {
      getCapabilities: capabilities ? () => capabilities : undefined,
      applyConstraints,
      stop: vi.fn(),
    };
    const stream = {
      getVideoTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: () => Promise.resolve(stream) },
      configurable: true,
    });
    const hook = renderHook(() => useCamera());
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    return { hook, applyConstraints };
  }

  it('clamps a level to the capability range', () => {
    const range = { min: 1, max: 1.5 };
    expect(clampZoom(2, range)).toBe(1.5);
    expect(clampZoom(0.5, range)).toBe(1);
    expect(clampZoom(1.2, range)).toBe(1.2);
  });

  it('is unsupported without a zoom capability, and setZoom then does nothing', async () => {
    const { hook, applyConstraints } = await openCamera({ torch: true });
    expect(hook.result.current.zoomSupported).toBe(false);
    expect(await hook.result.current.setZoom(2)).toBe(false);
    expect(applyConstraints).not.toHaveBeenCalled();
  });

  it('is unsupported when the zoom range is a single level', async () => {
    const { hook } = await openCamera({ zoom: { min: 1, max: 1 } });
    expect(hook.result.current.zoomSupported).toBe(false);
  });

  it('is unsupported where the browser has no getCapabilities', async () => {
    const { hook } = await openCamera(undefined);
    expect(hook.result.current.zoomSupported).toBe(false);
  });

  it('applies the zoom constraint, clamped to the track range', async () => {
    const { hook, applyConstraints } = await openCamera({
      zoom: { min: 1, max: 1.5, step: 0.1 },
    });
    expect(hook.result.current.zoomSupported).toBe(true);
    await act(async () => {
      expect(await hook.result.current.setZoom(2)).toBe(true);
    });
    expect(applyConstraints).toHaveBeenLastCalledWith({
      advanced: [{ zoom: 1.5 }],
    });
    await act(async () => {
      await hook.result.current.setZoom(1);
    });
    expect(applyConstraints).toHaveBeenLastCalledWith({
      advanced: [{ zoom: 1 }],
    });
  });

  it('resolves false when the camera refuses the level', async () => {
    const { hook, applyConstraints } = await openCamera({
      zoom: { min: 1, max: 4 },
    });
    applyConstraints.mockRejectedValueOnce(new Error('refused'));
    expect(await hook.result.current.setZoom(2)).toBe(false);
  });
});

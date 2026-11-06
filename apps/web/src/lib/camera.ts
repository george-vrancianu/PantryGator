import { useCallback, useEffect, useRef, useState } from 'react';
import { videoPoint } from './cameraFrame';
import { SCAN_INTERVAL_MS } from './cameraMode';
import { readCameraOrientation } from './cameraOrientation';
import { isValidBarcode } from './gtin';

/** Ask for 1080p where the device can, in every Scan Mode so changing mode never restarts the stream: a receipt's small print is unreadable at the 640x480 browsers often default to. */
export const HIGH_RESOLUTION_VIDEO = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
};

export function cameraConstraints(): MediaStreamConstraints {
  return {
    video: {
      facingMode: { ideal: 'environment' },
      // `ideal`, never `exact`: lesser cameras still start, at whatever they can do.
      ...HIGH_RESOLUTION_VIDEO,
    },
  };
}

/** Barcodes a product carries: EAN-13, EAN-8, UPC-A and UPC-E. */
export const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

type Detector = {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>>;
};
type NativeDetector = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

let detector: Promise<Detector> | null = null;

/** The browser's detector where it reads all four formats; otherwise the ZXing WASM one, loaded on first use. */
function loadDetector(): Promise<Detector> {
  detector ??= (async () => {
    const native = (window as { BarcodeDetector?: NativeDetector })
      .BarcodeDetector;
    try {
      const supported = (await native?.getSupportedFormats()) ?? [];
      if (native && BARCODE_FORMATS.every((f) => supported.includes(f))) {
        return new native({ formats: BARCODE_FORMATS });
      }
    } catch {
      // Fall through to the ponyfill.
    }
    const { createZXingDetector } = await import('./barcodeDecoder');
    return createZXingDetector(BARCODE_FORMATS);
  })();
  // A failed load (offline) must not stick: the next try starts again.
  detector.catch(() => (detector = null));
  return detector;
}

/** The first product barcode in a video frame or a captured image (8, 12 or 13 digits), or null. */
export async function readBarcode(
  source: HTMLVideoElement | Blob,
): Promise<string | null> {
  const found = await (await loadDetector()).detect(source);
  return found.find((code) => isValidBarcode(code.rawValue))?.rawValue ?? null;
}

export type CameraStatus = 'starting' | 'ready' | 'unavailable';

/** How long a single-shot focus pass may take before the Scan goes ahead anyway. */
export const FOCUS_TIMEOUT_MS = 1000;
/** The steady pause where the browser cannot focus on demand (iOS Safari). */
export const FOCUS_PAUSE_MS = 400;
/** Where a focus pass aims when it is not told the guide's centre (the hosts always pass it; this is the fallback for a caller that cannot), as a fraction of the video height (approximate: the feed is object-fit: cover). */
export const FOCUS_POINT_Y = 0.44;

/** A point of the camera frame as a fraction across and down it (0 to 1). */
export type FocusPoint = { x: number; y: number };

/** A focus pass started by a hold: `done` resolves once focus finishes, times out or is cancelled. */
export type FocusPass = { done: Promise<void>; cancel: () => void };

type FocusConstraints = MediaTrackConstraints & {
  advanced?: Array<{
    focusMode?: string;
    pointsOfInterest?: Array<{ x: number; y: number }>;
  }>;
};

type TorchConstraints = MediaTrackConstraints & {
  advanced?: Array<{ torch?: boolean }>;
};

type ZoomConstraints = MediaTrackConstraints & {
  advanced?: Array<{ zoom?: number }>;
};

/** The zoom range a track reports in its capabilities. */
export type ZoomRange = { min: number; max: number; step?: number };

/** A zoom level inside the track's range: asking for 2 on a camera that tops out at 1.5 gives 1.5. */
export function clampZoom(level: number, range: ZoomRange): number {
  return Math.min(range.max, Math.max(range.min, level));
}

/**
 * The rear camera as a live preview. `unavailable` covers no camera, a denied
 * permission, and a non-secure page; the Scan screen then offers Import instead.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('starting');
  // Many devices (and every desktop webcam) have no torch: the flash toggle must say so.
  const [torchSupported, setTorchSupported] = useState(false);
  // Best-effort focus: only browsers that expose single-shot focus (mostly Chrome on Android).
  const focusSupportedRef = useRef(false);
  // Optical or sensor zoom of the track itself: never a digital crop, which would break the receipt crop.
  const [zoomSupported, setZoomSupported] = useState(false);
  const zoomRangeRef = useRef<ZoomRange | null>(null);

  useEffect(() => {
    let cancelled = false;
    // oxlint-disable-next-line react/set-state-in-effect -- resets the status for a new camera stream; the stream is an external system
    setStatus('starting');
    // The new stream's torch starts off and its support is not known yet.
    setTorchSupported(false);
    setZoomSupported(false);
    zoomRangeRef.current = null;
    focusSupportedRef.current = false;
    const devices = navigator.mediaDevices as MediaDevices | undefined;
    if (!devices?.getUserMedia) {
      setStatus('unavailable');
      return;
    }
    devices
      .getUserMedia(cameraConstraints())
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        // `torch` is not in the DOM typings; `getCapabilities` itself is missing in some browsers.
        const capabilities = stream.getVideoTracks()[0]?.getCapabilities?.() as
          | {
              torch?: boolean;
              focusMode?: string[];
              zoom?: Partial<ZoomRange>;
            }
          | undefined;
        setTorchSupported(capabilities?.torch === true);
        const zoom = capabilities?.zoom;
        if (
          typeof zoom?.min === 'number' &&
          typeof zoom.max === 'number' &&
          zoom.max > zoom.min
        ) {
          zoomRangeRef.current = { min: zoom.min, max: zoom.max };
          setZoomSupported(true);
        }
        focusSupportedRef.current =
          capabilities?.focusMode?.includes('single-shot') === true;
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  /** The current preview frame as an image, or null when there is no live camera. */
  const capture = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  }, []);

  /** Switches the torch where the device supports it; resolves to whether it did. */
  const setTorch = useCallback(async (on: boolean): Promise<boolean> => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return false;
    try {
      await track.applyConstraints({
        advanced: [{ torch: on }],
      } as TorchConstraints);
      return true;
    } catch {
      return false;
    }
  }, []);

  /** Zooms the track to `level`, clamped to its capability; resolves to whether the camera took it. */
  const setZoom = useCallback(async (level: number): Promise<boolean> => {
    const track = streamRef.current?.getVideoTracks()[0];
    const range = zoomRangeRef.current;
    if (!track || !range) return false;
    try {
      await track.applyConstraints({
        advanced: [{ zoom: clampZoom(level, range) }],
      } as ZoomConstraints);
      return true;
    } catch {
      return false;
    }
  }, []);

  /**
   * Gets the camera ready for a Scan. Where single-shot focus is supported it focuses on the guide
   * centre, given as a fraction of the camera frame in the rotated-back frame (waiting up to 1 s) and always puts the camera back to continuous afterwards, including on cancel; elsewhere it just pauses 400 ms.
   * Focus failing never blocks the Scan: `done` always resolves.
   */
  const focusForScan = useCallback(
    (guideCentre: FocusPoint = { x: 0.5, y: FOCUS_POINT_Y }): FocusPass => {
      const track = streamRef.current?.getVideoTracks()[0];
      let timer: ReturnType<typeof setTimeout> | undefined;
      let finish: () => void = () => {};
      const done = new Promise<void>((resolve) => (finish = resolve));
      if (!track || !focusSupportedRef.current) {
        timer = setTimeout(finish, FOCUS_PAUSE_MS);
        return {
          done,
          cancel: () => {
            clearTimeout(timer);
            finish();
          },
        };
      }
      let restored = false;
      const restore = () => {
        if (restored) return;
        restored = true;
        track
          .applyConstraints({
            advanced: [{ focusMode: 'continuous' }],
          } as FocusConstraints)
          .catch(() => {});
      };
      let settled = false;
      let applied = false;
      let waited = false;
      const timers: Array<ReturnType<typeof setTimeout>> = [];
      const settle = () => {
        if (settled) return;
        settled = true;
        timers.forEach(clearTimeout);
        finish();
        // Not before the Scan has taken its frame, so the lens is not changing while the Scan's frame is taken.
        setTimeout(restore, 0);
      };
      // `applyConstraints` resolves as soon as the settings are accepted, long before the lens has
      // moved: so wait at least the steady pause, and at most the timeout.
      timers.push(
        setTimeout(() => {
          waited = true;
          if (applied) settle();
        }, FOCUS_PAUSE_MS),
        setTimeout(settle, FOCUS_TIMEOUT_MS),
      );
      track
        .applyConstraints({
          advanced: [
            {
              focusMode: 'single-shot',
              // Approximate: the feed is object-fit: cover, so the guide centre in the video's own
              // coordinates is not exactly the guide's fraction of the screen. With the screen
              // turned, the guide (in the rotated-back frame) is at that point of the turned photo:
              // the video's own point is that turned back.
              pointsOfInterest: [
                videoPoint(guideCentre, readCameraOrientation().photoTurn),
              ],
            },
          ],
        } as FocusConstraints)
        .then(() => {
          applied = true;
          if (waited) settle();
        }, settle);
      return {
        done,
        cancel: () => {
          settled = true;
          timers.forEach(clearTimeout);
          restore();
          finish();
        },
      };
    },
    [],
  );

  /**
   * Reads barcodes from the live preview until the first one, which goes to `onCode`. Returns a
   * function that stops the watch. Starting it is what first loads a ZXing decoder.
   */
  const watchBarcodes = useCallback((onCode: (code: string) => void) => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const video = videoRef.current;
      try {
        const code =
          video && video.readyState >= 2 ? await readBarcode(video) : null;
        if (stopped) return;
        if (code) {
          stopped = true;
          onCode(code);
          return;
        }
      } catch {
        // A frame that cannot be read, or a decoder that has not loaded yet: try the next one.
      }
      if (!stopped) timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  return {
    videoRef,
    status,
    torchSupported,
    zoomSupported,
    setZoom,
    focusForScan,
    capture,
    setTorch,
    watchBarcodes,
  };
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { readBarcode, useCamera } from '../../../lib/camera';
import { normalizeBarcode } from '../../../lib/gtin';
import { decodePhotoBarcode, readScans } from '../../../lib/scanReads';
import {
  sessionHeld,
  heldBy,
  MAX_SESSION_SCANS,
  dispatchScanSession,
  getScanSession,
  pendingCount,
  resetScanSession,
  useScanSession,
} from '../../../lib/scanSession';
import { resizeImage } from '../../../lib/image';
import {
  importPhotos,
  importRoom,
  resizingImports,
} from '../../../lib/importPhotos';
import { IMAGE_PREPARATION } from '../../../lib/scanImage';
import {
  clearScanLanguageOverride,
  useSessionScanLanguage,
} from '../../../lib/sessionScanLanguage';
import type { ScanLanguage } from '../../../i18n/resources';
import { measureShot } from './useGuideRect';
import {
  CAMERA_MODES,
  loadScanPageMode,
  saveScanPageMode,
  SCAN_INTERVAL_MS,
  scanModeOf,
  type CameraMode,
} from '../../../lib/cameraMode';

/** A code identical to the last accepted one is taken again after this long without being seen. */
const BARCODE_COOLDOWN_MS = 1500;
const BARCODE_HAPTIC_MS = 12;

/**
 * What opens the camera decides how it behaves: which modes it offers and starts in, whether Import is
 * offered, and where the shutter, the photo stack and Close go. The screen never asks who opened it.
 */
export type ScanScreenModes = {
  /** In mode-slider order. Defaults to all five camera modes. */
  modes?: readonly CameraMode[];
  /** Used when the URL names no allowed mode and either `rememberMode` is false or the remembered mode isn't allowed. */
  defaultMode?: CameraMode;
  /** Load and save the mode used last. Defaults to true, as on the main Scan page; callers with their own mode set pass false. */
  rememberMode?: boolean;
  /**
   * A camera Scan or a Barcode card just joined the Scan Session, with its thumbnail: the page flies
   * it into the photo stack. Decoration only, called after the card is already in the Session.
   */
  onCardAdded?: (thumbnail: string, mode: CameraMode) => void;
  /** Whether Import (Add from photos) is offered. Defaults to true. */
  importOffered?: boolean;
  /** The photo stack was pressed: where it goes. Defaults to the app's Review overview. */
  openStack?: (firstScanId: string | undefined) => void;
  /**
   * Where Close goes (replacing the camera in the history), keeping the Scan Session: the host owns what
   * happens to the photos. Without it Close goes back to wherever the Member came from, or home when the
   * camera was the first page, and asks before discarding photos.
   */
  closeTo?: string;
};

/** The camera as the app opens it at `/scan`: every mode, Import, shutter stays, the stack opens the Review overview. */
export const IN_APP_SCAN_SETTINGS: ScanScreenModes = {
  modes: CAMERA_MODES,
  rememberMode: true,
  importOffered: true,
};

/** Scan screen state: mode, camera, flash, and the photo-to-Review flow. */
export function useScanScreen(config: ScanScreenModes = {}) {
  const modes = config.modes ?? CAMERA_MODES;
  const remembersMode = config.rememberMode ?? true;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const requested = params.get('mode');
  const allowed = (value: string | null | undefined): value is CameraMode =>
    modes.some((item) => item === value);
  const { defaultMode } = config;
  const remembered = remembersMode ? loadScanPageMode() : null;
  const mode: CameraMode = allowed(requested)
    ? requested
    : allowed(remembered)
      ? remembered
      : allowed(defaultMode)
        ? defaultMode
        : modes[0];
  // Plain `/scan` (the Dock) comes back to whatever was used last, including a `?mode=` link.
  useEffect(() => {
    if (remembersMode) saveScanPageMode(mode);
  }, [mode, remembersMode]);

  const camera = useCamera();
  const {
    scanLanguage,
    scanLanguageToSend,
    setOverride: overrideScanLanguage,
  } = useSessionScanLanguage();
  const previousMode = useRef(mode);
  /**
   * Bumped whenever what a photo being prepared was meant for goes away (mode change, Scan Session
   * reset, leaving the screen): a photo prepared under an older value is dropped, not sent.
   */
  const scanEpoch = useRef(0);
  /**
   * The barcode just accepted. The same code is ignored until another is accepted, the mode
   * changes, or it goes unseen for the cooldown (see `lastSeenAt`).
   */
  const lastCode = useRef<string | null>(null);
  /** When `lastCode` was last seen: every sighting of a held pack restarts its cooldown. */
  const lastSeenAt = useRef(0);
  /** Barcodes accepted since this screen opened: only a change in it is announced, never what the Session already held. */
  const [barcodesRead, setBarcodesRead] = useState(0);
  useEffect(
    () => () => {
      scanEpoch.current += 1;
    },
    [],
  );
  // The mode can also change through the URL (the Dock's Scan item links to plain `/scan`),
  // bypassing `setMode`: a photo being prepared is dropped.
  useEffect(() => {
    if (previousMode.current !== mode) {
      scanEpoch.current += 1;
      // Coming back to Barcode takes the pack still held in front of the camera.
      lastCode.current = null;
    }
    previousMode.current = mode;
  }, [mode]);
  const [flash, setFlash] = useState(false);
  const [resizing, setResizing] = useState(false);
  // Problems found on this screen itself (bad image, nothing recognised), as `errors` keys.
  const [localError, setLocalError] = useState<string | null>(null);
  /** A camera Scan that could not be prepared, so never joined the Scan Session. */
  const [notAdded, setNotAdded] = useState(false);
  const session = useScanSession();
  const capped = sessionHeld(session);
  const outOfCredits = heldBy(session) === 'credits';
  // A short message at the bottom of the screen: the Scan Session is full, or a Scan Session was just saved.
  const [toast, setToast] = useState<{
    text: string;
    severity: 'success' | 'warning';
  } | null>(() => {
    const state = location.state as {
      added?: number;
      notTicked?: number;
      discarded?: boolean;
    } | null;
    if (state?.added)
      return {
        text: [
          t('scan:added', { count: state.added }),
          state.notTicked
            ? t('scan:tickFailed', { count: state.notTicked })
            : '',
        ]
          .join(' ')
          .trim(),
        severity: state.notTicked ? 'warning' : 'success',
      };
    if (state?.discarded)
      return { text: t('scan:discarded'), severity: 'success' };
    return null;
  });
  const warnSessionFull = () =>
    setToast({
      text: t('scan:limit', { count: MAX_SESSION_SCANS }),
      severity: 'warning',
    });
  useEffect(() => {
    if (location.state === null) return;
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: null,
    });
  }, [location, navigate]);
  const cardAdded = useRef(config.onCardAdded);
  useLayoutEffect(() => {
    cardAdded.current = config.onCardAdded;
  });

  const reading = resizing;

  /** A camera frame: prepare it, then join the Scan Session. (Gallery files go through `importPhotos`.) */
  const scanFrame = async (
    frame: Blob,
    aim: ReturnType<typeof measureShot>,
  ): Promise<void> => {
    setLocalError(null);
    setNotAdded(false);
    setResizing(true);
    const epoch = scanEpoch.current;
    let image: string;
    try {
      // Barcode sends no photo: it never gets here.
      if (mode === 'barcode')
        throw new Error('Barcode has no photo to prepare');
      image = await IMAGE_PREPARATION[mode](
        frame,
        'camera',
        aim.view,
        aim.turn,
      );
    } catch {
      if (epoch === scanEpoch.current) {
        if (mode !== 'plate') setNotAdded(true);
        else setLocalError('scan.image_invalid');
      }
      return;
    } finally {
      setResizing(false);
    }
    if (epoch !== scanEpoch.current) return;
    // A camera Scan joins the Scan Session at once; its read goes on in the background.
    if (
      getScanSession().scans.length + resizingImports() >=
      MAX_SESSION_SCANS
    ) {
      warnSessionFull();
      return;
    }
    const id = crypto.randomUUID();
    dispatchScanSession({
      type: 'enqueue',
      scan: {
        id,
        mode,
        scanLanguage: mode === 'plate' ? undefined : scanLanguageToSend,
        image,
        thumbnail: image,
      },
    });
    cardAdded.current?.(image, mode);
    readScans();
    // The full frame, before it was resized for the read: barcodes need the resolution.
    if (mode === 'product')
      decodePhotoBarcode(id, frame, (photo) => readBarcode(photo));
  };

  // Two quick presses must not send the same photo twice.
  const shooting = useRef(false);
  const shoot = async () => {
    if (shooting.current || capped || mode === 'barcode') return;
    shooting.current = true;
    try {
      // The guide and the turn as they are when the shutter fires, not when the frame arrives.
      const aim = measureShot(camera.videoRef.current);
      const frame = await camera.capture();
      if (frame) await scanFrame(frame, aim);
    } finally {
      shooting.current = false;
    }
  };

  const importFiles = (picked: File[]) => {
    if (picked.length === 0 || mode === 'barcode') return;
    setLocalError(null);
    setNotAdded(false);
    // Files that do not fit are left out and the limit toast replaces this one (see `onFull`).
    const added = Math.min(picked.length, importRoom());
    if (added > 0)
      setToast({
        text: t('scan:import.added', {
          count: added,
          mode: t(`scan:mode.${mode}`),
        }),
        severity: 'success',
      });
    importPhotos(picked, {
      mode: scanModeOf(mode),
      scanLanguage: scanLanguageToSend,
      onFull: warnSessionFull,
      onInvalid: () => setLocalError('scan.image_invalid'),
    });
  };

  // The Barcode mode reads on its own. Each accepted code adds a card at once; the watch reads one
  // code per subscription, so it is re-armed after every read.
  const acceptCode = async (code: string) => {
    // The code just accepted is ignored while it keeps being seen: it is taken again once
    // another code was accepted, or once it has gone unseen for the cooldown.
    // Compared in canonical form: a UPC-A and its EAN-13 form are one pack.
    const canonical = normalizeBarcode(code) ?? code;
    const now = performance.now();
    const held =
      canonical === lastCode.current &&
      now - lastSeenAt.current < BARCODE_COOLDOWN_MS;
    lastSeenAt.current = now;
    if (held) return;
    // Remembered before the limit check, so a held pack at the limit toasts once, not every tick.
    lastCode.current = canonical;
    if (
      getScanSession().scans.length + resizingImports() >=
      MAX_SESSION_SCANS
    ) {
      warnSessionFull();
      return;
    }
    const epoch = scanEpoch.current;
    // The card's thumbnail is the frame the code was read from, frozen now.
    const frame = await camera.capture();
    const thumbnail = frame ? await resizeImage(frame).catch(() => '') : '';
    if (epoch !== scanEpoch.current) {
      lastCode.current = null;
      return;
    }
    // Another read may have filled the Scan Session while the frame was prepared.
    if (getScanSession().scans.length >= MAX_SESSION_SCANS) {
      // Nothing was added, so the pack still held up must be taken again once there is room.
      lastCode.current = null;
      warnSessionFull();
      return;
    }
    dispatchScanSession({
      type: 'enqueue',
      scan: { id: crypto.randomUUID(), mode: 'barcode', code, thumbnail },
    });
    navigator.vibrate?.(BARCODE_HAPTIC_MS);
    setBarcodesRead((n) => n + 1);
    cardAdded.current?.(thumbnail, 'barcode');
    // The lookup starts at once, outside the read slots.
    readScans();
  };
  const onCode = useRef(acceptCode);
  useLayoutEffect(() => {
    onCode.current = acceptCode;
  });
  const { watchBarcodes } = camera;
  useEffect(() => {
    if (mode !== 'barcode' || camera.status !== 'ready') return;
    let stopped = false;
    let stop = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      stop = watchBarcodes((code) => {
        if (stopped) return;
        void onCode.current(code);
        // The camera ticks as soon as it is watched, so a held pack waits out the scan interval.
        timer = setTimeout(arm, SCAN_INTERVAL_MS);
      });
    };
    arm();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stop();
    };
  }, [mode, camera.status, watchBarcodes]);

  const toggleFlash = async () => {
    const next = !flash;
    // Only show the flash as on if the device actually switched the torch.
    if (await camera.setTorch(next)) setFlash(next);
  };

  const error = localError ? t(`errors:${localError}`) : null;

  return {
    modes,
    mode,
    scanLanguage,
    /** A pick on the screen: for the rest of the Scan Session only (never the preference). */
    pickScanLanguage: (language: ScanLanguage) => {
      overrideScanLanguage(language);
      setToast({
        text: t('scan:scanLanguage.read', {
          language: t(`scan:scanLanguage.inSentence.${language}`),
        }),
        severity: 'success',
      });
    },
    /** Plate Scan has no Scan Language. */
    scanLanguageShown: mode !== 'plate' && mode !== 'barcode',
    scanLanguageLocked: reading,
    camera,
    scans: session.scans,
    /** The Session's Barcode card count once a read happened on this screen, else 0: what the live region announces. */
    barcodesAnnounced:
      barcodesRead > 0
        ? session.scans.filter((scan) => scan.mode === 'barcode').length
        : 0,
    pending: pendingCount(session),
    /** The photo stack: Review opens even while reads run. */
    openReview: () => {
      const first = session.scans[0]?.id;
      if (config.openStack) config.openStack(first);
      else navigate('/scan/review');
    },
    /** Whether Import is offered. */
    importOffered: config.importOffered ?? true,
    flash,
    reading,
    modesDisabled: resizing,
    controlsDisabled: reading || capped,
    capped,
    /** What holds the Session is the Family being out of Credits, not the Scan Cap. */
    outOfCredits,
    /** The Scan Session holds the most cards it can. */
    full: session.scans.length >= MAX_SESSION_SCANS,
    /** The shutter was pressed while it was disabled: the limit says why (the other reasons already show). */
    shutterBlocked: () => {
      if (session.scans.length >= MAX_SESSION_SCANS) warnSessionFull();
    },
    notAdded,
    dismissNotAdded: () => setNotAdded(false),
    error,
    setMode: (next: CameraMode) => {
      scanEpoch.current += 1;
      lastCode.current = null;
      setLocalError(null);
      setParams({ mode: next }, { replace: true });
    },
    toast,
    clearToast: () => setToast(null),
    shoot,
    importFiles,
    toggleFlash,
    // Back to wherever the Member came from, or home when this was the first page.
    close: () => {
      const { closeTo } = config;
      if (closeTo !== undefined) {
        clearScanLanguageOverride();
        navigate(closeTo, { replace: true });
        return;
      }
      const taken = session.scans.length;
      if (taken > 0) {
        if (!window.confirm(t('scan:discardScans', { count: taken }))) return;
        resetScanSession();
        // Nothing is left to go back to: the overview and the camera of this Session are empty.
        navigate('/');
        return;
      }
      clearScanLanguageOverride();
      if (location.key === 'default') navigate('/');
      else navigate(-1);
    },
  };
}

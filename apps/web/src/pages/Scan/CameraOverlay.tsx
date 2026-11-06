import {
  Alert,
  bodyFont,
  Box,
  radius,
  tokens,
  Typography,
  useForcedThemeColor,
  visuallyHidden,
} from '@pocket-pantry/ui';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '../../i18n/translateApiError';
import { ApiError } from '../../lib/api';
import { isOutOfCredits } from '../../lib/credits';
import { useBarcodeLookup, type BarcodeLookup } from '../../lib/barcode';
import { readBarcode, useCamera } from '../../lib/camera';
import type { CameraMode } from '../../lib/cameraMode';
import { useProductRead, type ProposedLine } from '../../lib/scan';
import { IMAGE_PREPARATION } from '../../lib/scanImage';
import { BarcodeResultCard } from '../../components/camera/BarcodeResultCard';
import {
  CameraFrame,
  FeedBox,
  insetTop,
  swipeTouchAction,
  useFeedArea,
} from '../../components/camera/CameraFrame';
import { CameraControls } from '../../components/camera/CameraControls';
import { CameraTopBar } from '../../components/camera/CameraTopBar';
import { Fading } from './components/Fading';
import { InfoSheet } from '../../components/camera/InfoSheet';
import {
  glassFocusRing,
  shade,
  translucent,
} from '../../components/camera/glass';
import { ModePicker } from '../../components/camera/ModePicker';
import { ScanLanguageChip } from './components/ScanLanguageChip';
import { ShutterButton } from './components/ShutterButton';
import { ZoomPill } from './components/ZoomPill';
import { Viewfinder, useShotFeedback } from './components/Viewfinder';
import {
  guideFocusPoint,
  measureShot,
  useGuideRect,
} from './hooks/useGuideRect';
import { useScanLanguage } from '../../lib/useScanLanguage';
import { useCameraOrientation } from '../../lib/useCameraOrientation';
import { usePortraitLock } from '../../lib/usePortraitLock';

export type { CameraMode };

/** What the camera hands back to whatever opened it, then closes: one kind per way out. */
export type CameraResult =
  | {
      kind: 'product';
      /** The first line the photo's label read gave (the overlay did the read). */
      read: ProposedLine;
      /**
       * The barcode of the photo, or null: the code of an unknown barcode the Member came from,
       * else decoded on the device from the frame, never awaited by the read. Never rejects.
       */
      barcode: Promise<string | null>;
    }
  | {
      kind: 'barcode';
      /** The read EAN-13, EAN-8, UPC-A or UPC-E code the Member confirmed with Use this. */
      code: string;
      lookup: Extract<BarcodeLookup, { found: true }>;
    }
  | {
      /** Type it: back to the sheet with the search focused; the code of an unknown barcode, if any, still goes with the Batch. */
      kind: 'type';
      code: string | null;
    };

type Props = {
  /** In slider order; the slider is hidden when there is only one. */
  modes: readonly CameraMode[];
  /** The mode the camera opens in; the first of `modes` when it is not one of them. */
  defaultMode: CameraMode;
  /** A label was read, a barcode was confirmed, or the Member chose to type: the opener closes the overlay and applies it. */
  onResult: (result: CameraResult) => void;
  /** Scan several: the opener closes what the camera was opened over and opens the Scan page in this mode. */
  onScanSeveral: (mode: CameraMode) => void;
  /** Closed without a shot; the opener is left as it was. */
  onCancel: () => void;
};

/** The row the "adds to pantry" pill sits in, under the top bar: centred on the feed, so left of the rail where there is one. */
function AddsToPantryRow({ children }: { children: ReactNode }) {
  const feed = useFeedArea();
  return (
    <Box
      sx={{
        position: 'absolute',
        left: 0,
        right: feed.right(0),
        top: `calc(${insetTop} + 64px)`,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      {children}
    </Box>
  );
}

/**
 * The camera as a full-screen overlay for a page that needs one photo back (the add-Batch form),
 * not a Scan Session. Its mode lives in the overlay, never in the URL: it is opened over a page
 * whose own address and settings are not its to change. The
 * Scan Language is the Scan page's remembered one, and only Product mode has it: a Barcode Lookup
 * is not a Scan.
 */
export function CameraOverlay({
  modes,
  defaultMode,
  onResult,
  onScanSeveral,
  onCancel,
}: Props) {
  const { t } = useTranslation('scan');
  useForcedThemeColor('dark');
  usePortraitLock();
  const { rotateBack } = useCameraOrientation();
  const camera = useCamera();
  const { scanLanguage, scanLanguageToSend, setScanLanguage } =
    useScanLanguage();
  const [mode, setMode] = useState<CameraMode>(
    modes.includes(defaultMode) ? defaultMode : modes[0],
  );
  const [infoOpen, setInfoOpen] = useState(false);
  const closeInfo = useCallback(() => setInfoOpen(false), []);
  const [flash, setFlash] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // The barcode on the card, and its lookup while that is out; and the code of an unknown barcode
  // the Member is taking a photo for instead.
  const [card, setCard] = useState<{
    code: string;
    lookup: BarcodeLookup | null;
    /** The lookup failed (unavailable, rate limited): said on the card, with Scan again, Type it and Take a photo. */
    error?: unknown;
  } | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const { t: tAll } = useTranslation();
  const productRead = useProductRead();
  const barcodeLookup = useBarcodeLookup();
  const { shot, fire } = useShotFeedback();
  const [viewfinder, setViewfinder] = useState<HTMLElement | null>(null);
  const guide = useGuideRect(mode, viewfinder);
  const [sliding, setSliding] = useState(false);
  const shooting = useRef(false);
  // The Barcode Lookup in flight (its number), so a result that lands after the card was dismissed
  // or the mode changed is ignored. The pending check is defensive: the watcher stops after the first
  // code, so a second read cannot arrive while a lookup is out.
  const lookupSeq = useRef(0);
  const lookupPending = useRef<number | null>(null);
  const dismissCard = () => {
    lookupPending.current = null;
    setCard(null);
  };
  const { videoRef } = camera;

  // Focus moves into the dialog on open, and Escape closes it as Close does.
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => dialog.current?.focus(), []);
  // Set once the overlay is cancelled or gone: a photo still being prepared is then dropped.
  const closed = useRef(false);
  const cancelRef = useRef(onCancel);
  // Escape closes the Info sheet first, not the camera under it.
  const infoOpenRef = useRef(false);
  useLayoutEffect(() => {
    cancelRef.current = onCancel;
    infoOpenRef.current = infoOpen;
  });
  const cancel = () => {
    closed.current = true;
    lookupPending.current = null;
    cancelRef.current();
  };
  // Escape inside the overlay is taken here and stops, so a host dialog around it (the Add to Pantry
  // sheet) does not also close. The document listener below covers focus outside the overlay.
  const onOverlayKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    // The Info sheet answers its own Escape on the document, which this stop would cut off.
    if (infoOpenRef.current) closeInfo();
    else cancel();
  };
  useEffect(() => {
    closed.current = false;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !infoOpenRef.current) {
        closed.current = true;
        cancelRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      closed.current = true;
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // Barcode reads the live stream: a code stops the reading and shows the card (looked up first);
  // Scan again dismisses it and reads again. The decoder (WASM where the browser has none) is
  // loaded by this call, the first time Barcode is used.
  const { watchBarcodes } = camera;
  const { mutate: lookUp } = barcodeLookup;
  const reading = card !== null;
  useEffect(() => {
    if (mode !== 'barcode' || camera.status !== 'ready' || reading) return;
    return watchBarcodes((code) => {
      if (closed.current || lookupPending.current !== null) return;
      const seq = ++lookupSeq.current;
      lookupPending.current = seq;
      navigator.vibrate?.(12);
      setCard({ code, lookup: null });
      lookUp(code, {
        onSuccess: (lookup) => {
          if (lookupPending.current === seq) setCard({ code, lookup });
        },
        onError: (error) => {
          if (lookupPending.current === seq)
            setCard({ code, lookup: null, error });
        },
      });
    });
  }, [mode, camera.status, watchBarcodes, reading, lookUp]);

  const confirmCard = () => {
    if (!card?.lookup?.found) return;
    closed.current = true;
    onResult({ kind: 'barcode', code: card.code, lookup: card.lookup });
  };
  const takePhotoOfCard = () => {
    if (!card) return;
    // A failed lookup says nothing about the code, so it is not taught as unknown.
    setPendingCode(card.error === undefined ? card.code : null);
    dismissCard();
    setMode('product');
  };
  const typeIt = () => {
    closed.current = true;
    onResult({
      kind: 'type',
      code: card ? (card.error === undefined ? card.code : null) : pendingCode,
    });
  };

  const shoot = async () => {
    if (mode === 'barcode' || shooting.current) return;
    shooting.current = true;
    setFailed(null);
    try {
      // The guide and the turn as they are when the shutter fires, not when the frame arrives.
      const aim = measureShot(camera.videoRef.current);
      const frame = await camera.capture();
      if (!frame) return;
      setPreparing(true);
      const image = await IMAGE_PREPARATION[mode](
        frame,
        'camera',
        aim.view,
        aim.turn,
      );
      if (closed.current) return;
      // The frame's barcode settles later, never delaying the read: the ZXing decode is main-thread
      // work, so it only starts once the read is under way. A code the Member came here with wins.
      const barcode = pendingCode
        ? Promise.resolve(pendingCode)
        : new Promise<string | null>((resolve) => {
            setTimeout(() => {
              readBarcode(frame).then(resolve, () => resolve(null));
            }, 0);
          });
      let read: ProposedLine;
      try {
        read = await productRead.mutateAsync({
          image,
          scanLanguage: scanLanguageToSend,
        });
      } catch (error) {
        if (!closed.current)
          setFailed(
            error instanceof ApiError && error.code === 'scan.cap_reached'
              ? t('labelCap')
              : isOutOfCredits(error)
                ? t('labelOutOfCredits')
                : t('labelFailed'),
          );
        return;
      }
      if (!closed.current) {
        closed.current = true;
        onResult({ kind: 'product', read, barcode });
      }
    } catch {
      setFailed(t('overlay.photoFailed'));
    } finally {
      setPreparing(false);
      shooting.current = false;
    }
  };

  const toggleFlash = async () => {
    if (await camera.setTorch(!flash)) setFlash(!flash);
  };

  return (
    <Box
      data-testid="camera-overlay"
      data-theme="dark"
      role="dialog"
      aria-modal="true"
      ref={dialog}
      onKeyDown={onOverlayKeyDown}
      tabIndex={-1}
      aria-label={t('title', {
        mode: t(`mode.${mode}`).toLocaleLowerCase(),
      })}
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 20,
        overflow: 'hidden',
        backgroundColor: tokens.color.bg,
        color: tokens.color.ink,
        fontFamily: bodyFont,
      }}
    >
      <Box
        ref={setViewfinder}
        sx={{
          position: 'absolute',
          inset: 0,
          touchAction: swipeTouchAction(rotateBack),
        }}
      >
        <Box
          component="video"
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-hidden="true"
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
        <Box
          aria-hidden="true"
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage: `radial-gradient(ellipse at 50% 45%, transparent 55%, ${shade(45)} 100%)`,
          }}
        />
      </Box>
      <CameraFrame>
        <Viewfinder
          rect={guide}
          shot={shot}
          sliding={sliding}
          scanLine={mode === 'barcode' && card === null}
        />
        <CameraTopBar
          onClose={cancel}
          torch={
            camera.torchSupported
              ? { on: flash, onToggle: () => void toggleFlash() }
              : undefined
          }
          onInfo={() => setInfoOpen(true)}
          language={
            <Fading hidden={mode === 'barcode'}>
              <ScanLanguageChip
                value={scanLanguage}
                disabled={preparing}
                onChange={setScanLanguage}
              />
            </Fading>
          }
        />
        <CameraControls
          zoom={
            camera.zoomSupported ? <ZoomPill onZoom={camera.setZoom} /> : null
          }
          status={
            <>
              <Typography
                role="status"
                component="div"
                sx={{ minHeight: 24, textAlign: 'center', fontSize: 13 }}
              >
                {camera.status === 'unavailable'
                  ? t('overlay.noCamera')
                  : mode === 'barcode' && card === null
                    ? t('overlay.pointAtBarcode')
                    : null}
              </Typography>
            </>
          }
          shutter={
            <ShutterButton
              ring={mode === 'barcode'}
              disabled={preparing || camera.status !== 'ready'}
              onShoot={() => {
                fire();
                void shoot();
              }}
              focusForScan={() =>
                camera.focusForScan(guideFocusPoint(guide, viewfinder))
              }
            />
          }
          slider={
            modes.length > 1 ? (
              <ModePicker
                modes={modes}
                mode={mode}
                disabled={preparing || infoOpen}
                keysDisabled={preparing || infoOpen}
                swipeSurface={viewfinder}
                onDragChange={setSliding}
                onChange={(next) => {
                  const picked = modes.find((item) => item === next);
                  if (!picked) return;
                  setMode(picked);
                  dismissCard();
                  setFailed(null);
                  if (picked === 'barcode') setPendingCode(null);
                }}
              />
            ) : (
              <Box sx={visuallyHidden}>{t(`mode.${mode}`)}</Box>
            )
          }
        />
        <AddsToPantryRow>
          <Box
            data-testid="adds-to-pantry"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              py: 0.75,
              px: 1.375,
              borderRadius: radius.pill,
              backgroundColor: translucent(tokens.color.accent, 16),
              color: tokens.color.accent,
              fontSize: 12,
              fontWeight: 700,
              pointerEvents: 'auto',
            }}
          >
            {t('addsToPantry')}
            <Box
              component="button"
              type="button"
              onClick={() => onScanSeveral(mode)}
              sx={{
                border: 0,
                background: 'none',
                color: tokens.color.ink,
                font: 'inherit',
                textDecoration: 'underline',
                cursor: 'pointer',
                p: 0,
                '&:focus-visible': glassFocusRing,
              }}
            >
              {t('scanSeveral')}
            </Box>
          </Box>
        </AddsToPantryRow>
        {failed ? (
          <FeedBox aboveFooter={196}>
            <Alert role="alert">
              {failed}
              <Box
                component="button"
                type="button"
                onClick={typeIt}
                sx={{
                  ml: 1,
                  border: 0,
                  background: 'none',
                  color: 'inherit',
                  font: 'inherit',
                  fontWeight: 700,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                {t('typeIt')}
              </Box>
            </Alert>
          </FeedBox>
        ) : null}
        {preparing && mode === 'product' ? (
          <FeedBox
            role="status"
            aboveFooter={196}
            centred
            sx={{
              px: 1.75,
              py: 1.125,
              borderRadius: radius.pill,
              backgroundColor: shade(80),
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {t('readingLabel')}
          </FeedBox>
        ) : null}
        {card ? (
          <BarcodeResultCard
            code={card.code}
            lookup={card.lookup}
            error={
              card.error === undefined
                ? undefined
                : translateApiError(tAll, card.error)
            }
            onScanAgain={dismissCard}
            onUse={confirmCard}
            onTakePhoto={takePhotoOfCard}
            onTypeIt={typeIt}
          />
        ) : null}
        {infoOpen ? (
          <InfoSheet onClose={closeInfo} modes={modes} stackTip={false} />
        ) : null}
      </CameraFrame>
    </Box>
  );
}

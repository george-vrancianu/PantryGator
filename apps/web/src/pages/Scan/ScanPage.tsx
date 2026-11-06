import {
  Alert,
  bodyFont,
  Box,
  tokens,
  useForcedThemeColor,
  visuallyHidden,
} from '@pocket-pantry/ui';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { shade } from '../../components/camera/glass';
import {
  CameraFrame,
  swipeTouchAction,
} from '../../components/camera/CameraFrame';
import { CameraControls } from '../../components/camera/CameraControls';
import { CameraToast } from '../../components/camera/CameraToast';
import { CameraTopBar } from '../../components/camera/CameraTopBar';
import { Fading } from './components/Fading';
import { ImportButton } from './components/ImportButton';
import { InfoSheet } from '../../components/camera/InfoSheet';
import { ModePicker } from '../../components/camera/ModePicker';
import { PhotoStack } from './components/PhotoStack';
import { ScanLanguageChip } from './components/ScanLanguageChip';
import { ZoomPill } from './components/ZoomPill';
import { ShutterButton } from './components/ShutterButton';
import { Viewfinder, useShotFeedback } from './components/Viewfinder';
import { useFlyToStack } from '../../components/camera/FlyToStack';
import { guideFocusPoint, useGuideRect } from './hooks/useGuideRect';
import {
  FOOTER_HEIGHT,
  FOOTER_MIN_BOTTOM,
  type Rect,
} from '../../lib/scanGuides';
import { failedCopyKey } from '../../lib/scanSession';
import { useCameraOrientation } from '../../lib/useCameraOrientation';
import { usePortraitLock } from '../../lib/usePortraitLock';
import { useScanScreen, type ScanScreenModes } from './hooks/useScanScreen';

export type ScanPageProps = ScanScreenModes;

/**
 * The dark camera screen (handoff section 7). It is always in Dark-first,
 * whatever the Member's Theme, so the chrome never washes out the camera view.
 */
export function ScanPage(props: ScanPageProps) {
  const { t } = useTranslation('scan');
  useForcedThemeColor('dark');
  usePortraitLock();
  const { rotateBack } = useCameraOrientation();
  // Where the guide is when a card joins the Scan Session: the photo flies from there to the stack.
  const guideNow = useRef<Rect | null>(null);
  const { fly, stackRef, layer: flights } = useFlyToStack();
  const screen = useScanScreen({
    ...props,
    onCardAdded: (thumbnail) => {
      if (guideNow.current) fly(thumbnail, guideNow.current);
    },
  });
  // Barcode cards are announced as barcodes, not photos.
  const photos = screen.scans.filter((scan) => scan.mode !== 'barcode').length;
  const { videoRef } = screen.camera;
  const modeLabel = t(`mode.${screen.mode}`);
  const [infoOpen, setInfoOpen] = useState(false);
  const { shot, fire } = useShotFeedback();
  // The viewfinder, so a sideways swipe on it also drives the mode slider.
  const [viewfinder, setViewfinder] = useState<HTMLElement | null>(null);
  const guide = useGuideRect(screen.mode, viewfinder);
  useLayoutEffect(() => {
    guideNow.current = guide;
  });
  const [sliding, setSliding] = useState(false);
  const closeInfo = useCallback(() => setInfoOpen(false), [setInfoOpen]);

  return (
    <Box
      data-testid="scan-screen"
      data-theme="dark"
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 20,
        overflow: 'hidden',
        backgroundColor: tokens.color.bg,
        color: tokens.color.ink,
        // Resolved under this subtree's Theme, not inherited from the root's.
        fontFamily: bodyFont,
      }}
    >
      <Box
        ref={setViewfinder}
        data-testid="scan-viewfinder"
        sx={{
          position: 'absolute',
          inset: 0,
          touchAction: swipeTouchAction(rotateBack),
        }}
      >
        <Box
          component="video"
          ref={videoRef}
          data-testid="scan-feed"
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
          data-testid="scan-vignette"
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
          scanLine={screen.mode === 'barcode'}
          readCount={
            screen.scans.filter((scan) => scan.mode === 'barcode').length
          }
        />

        <CameraTopBar
          heading={t('title', { mode: modeLabel.toLocaleLowerCase() })}
          onClose={screen.close}
          torch={
            screen.camera.torchSupported
              ? { on: screen.flash, onToggle: () => void screen.toggleFlash() }
              : undefined
          }
          language={
            <Fading hidden={!screen.scanLanguageShown}>
              <ScanLanguageChip
                value={screen.scanLanguage}
                disabled={screen.scanLanguageLocked}
                onChange={screen.pickScanLanguage}
              />
            </Fading>
          }
          onInfo={() => setInfoOpen(true)}
        />

        <CameraControls
          zoom={
            screen.camera.zoomSupported ? (
              <ZoomPill onZoom={screen.camera.setZoom} />
            ) : null
          }
          status={
            <>
              <Box
                role="status"
                sx={{ minHeight: 24, textAlign: 'center', fontSize: 13 }}
              >
                {screen.reading ? t('reading') : null}
                {screen.camera.status === 'unavailable'
                  ? t('noCamera')
                  : screen.mode === 'barcode'
                    ? t('overlay.pointAtBarcode')
                    : null}
              </Box>
              {/* Barcode Lookups are not Scans: the Scan Cap does not stop them. */}
              {screen.capped && screen.mode !== 'barcode' ? (
                <Box sx={{ mt: 1 }}>
                  <Alert severity="warning">
                    {t(screen.outOfCredits ? 'outOfCredits' : 'capReached')}
                  </Alert>
                </Box>
              ) : null}
              {screen.error ? (
                <Box sx={{ mt: 1 }}>
                  <Alert>{screen.error}</Alert>
                </Box>
              ) : null}
            </>
          }
          stack={
            <PhotoStack
              scans={screen.scans}
              onOpen={screen.openReview}
              stackRef={stackRef}
            />
          }
          shutter={
            <ShutterButton
              ring={screen.mode === 'barcode'}
              disabled={
                screen.controlsDisabled ||
                screen.full ||
                screen.camera.status !== 'ready'
              }
              onShoot={() => {
                fire();
                void screen.shoot();
              }}
              onBlocked={screen.shutterBlocked}
              focusForScan={() =>
                screen.camera.focusForScan(guideFocusPoint(guide, viewfinder))
              }
            />
          }
          right={
            <ImportButton
              hidden={screen.mode === 'barcode' || !screen.importOffered}
              disabled={screen.controlsDisabled}
              onFiles={screen.importFiles}
            />
          }
          slider={
            <ModePicker
              modes={screen.modes}
              mode={screen.mode}
              disabled={screen.modesDisabled || infoOpen}
              keysDisabled={screen.modesDisabled || infoOpen || screen.reading}
              onChange={screen.setMode}
              swipeSurface={viewfinder}
              onDragChange={setSliding}
            />
          }
        />

        {flights}

        <CameraToast
          open={screen.toast !== null}
          onClose={screen.clearToast}
          // 56 pt above the footer, clear of its status line.
          aboveFooter={FOOTER_HEIGHT + FOOTER_MIN_BOTTOM + 56}
        >
          <Alert severity={screen.toast?.severity} role="status">
            {screen.toast?.text}
          </Alert>
        </CameraToast>

        <Box role="status" sx={visuallyHidden}>
          {(['failed', 'lookupFailed'] as const).map((key) =>
            screen.scans.some(
              (scan) => scan.status === 'failed' && failedCopyKey(scan) === key,
            ) ? (
              <p key={key}>{t(`session.${key}`)}</p>
            ) : null,
          )}
          {photos > 0 ? <p>{t('photoAdded', { count: photos })}</p> : null}
          {screen.barcodesAnnounced > 0 ? (
            <p>{t('barcodeAdded', { count: screen.barcodesAnnounced })}</p>
          ) : null}
        </Box>

        <CameraToast open={screen.notAdded} onClose={screen.dismissNotAdded}>
          <Alert severity="warning" role="status">
            {t('notAdded')}
          </Alert>
        </CameraToast>

        {infoOpen ? <InfoSheet onClose={closeInfo} /> : null}
      </CameraFrame>
    </Box>
  );
}

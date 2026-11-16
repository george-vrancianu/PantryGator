import {
  Gator,
  Alert,
  Box,
  Button,
  CameraIcon,
  CloseIcon,
  ImagePlusIcon,
  Link,
  Typography,
  tokens,
  nestedRadius,
  radius,
  useToast,
} from '@pocket-pantry/ui';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { useGatorAlt } from '../../lib/useGatorAlt';
import { readScans } from '../../lib/scanReads';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { translateApiError } from '../../i18n/translateApiError';
import { GatorBanner } from '../../components/GatorBanner';
import { Screen } from '../../components/layout/Screen';
import { PlateChoice, cardId } from './components/PlateChoice';
import {
  ReceiptCropper,
  type ReceiptCrop,
} from '../../components/ReceiptCropper';
import { cropToReceiptArea } from '../../lib/image';
import { MAX_BULK_BATCHES } from '../../lib/scan';
import { loadLastScanMode } from '../../lib/cameraMode';
import { importPhotos } from '../../lib/importPhotos';
import { useSessionScanLanguage } from '../../lib/sessionScanLanguage';
import {
  displayName,
  invalidFields,
  unsureCount,
  type ReviewLine,
} from '../../lib/review';
import { savableLines, useSaveScan } from '../../lib/saveScan';
import {
  showsErrorCopy,
  canMerge,
  canRetry,
  MAX_SESSION_SCANS,
  dispatchScanSession,
  getScanSession,
  isBarcodeCard,
  isHeld,
  failedCopyKey,
  pendingCount,
  resetScanSession,
  scanDisplayState,
  uncroppedCount,
  useScanSession,
  type SessionScan,
} from '../../lib/scanSession';

const MAX_CHIPS = 8;

const linkButton = {
  mr: 1.5,
  p: 0,
  border: 0,
  background: 'none',
  color: tokens.color.accent,
  font: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

/** "Take more" and "Add from photos" (handoff 7.1): two equal dashed buttons after the last card. */
const dashedButton = {
  minHeight: 56,
  height: 'auto',
  borderRadius: radius.card,
  border: `1.5px dashed ${tokens.color.line}`,
  fontSize: 14,
  fontWeight: 800,
  gap: '9px',
};

/**
 * What the host decides for the overview. Every part is optional: without it the overview is the app's,
 * with the camera at `/scan`, a card opening at `/scan/review/:scanId` and the camera as the landing.
 */
export type ReviewOverviewSettings = {
  /** The camera: "Camera", "Take more" and Retake lead here. */
  cameraPath?: string;
  /** Where a card opens. */
  cardPath?: (scanId: string) => string;
  /** Whether Add from photos is offered. Defaults to true. */
  importOffered?: boolean;
  /** Add all just saved one card, with this many lines (Batches), before moving to the next card. */
  onCardSaved?: (lines: number) => void;
  /** Every card was saved (or dropped) by Add all; `added` cards were saved. Replaces landing on the camera. */
  afterAddAll?: (added: number, notTicked: number) => void;
  /** Discard all emptied the Scan Session. Replaces landing on the camera. */
  afterDiscardAll?: () => void;
  /** The X on a card removed it, leaving this many cards. */
  afterRemove?: (remaining: number) => void;
  /** The frame (and banner) wrapping the overview's content. */
  renderFrame?: (content: ReactNode) => ReactNode;
};

/**
 * The overview a Member reaches from the photo stack: one card per Scan of the Scan Session, in the order
 * the Scans were taken. A card opens the line editor for that Scan alone, at /scan/review/:scanId.
 */
export function ReviewOverviewPage({
  settings = {},
}: { settings?: ReviewOverviewSettings } = {}) {
  const cameraPath = settings.cameraPath ?? '/scan';
  const importOffered = settings.importOffered ?? true;
  const cardPath = settings.cardPath ?? ((id: string) => `/scan/review/${id}`);
  const { t } = useTranslation('review');
  const { t: tScan } = useTranslation('scan');
  const { t: tAll } = useTranslation();
  const gatorAlt = useGatorAlt();
  const saveScan = useSaveScan();
  const [saving, setSaving] = useState(false);
  // Why each card's last save failed; the card stays until a later Add saves it.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const toast = useToast();
  const { scanLanguageToSend: scanLanguage } = useSessionScanLanguage();
  const photosInput = useRef<HTMLInputElement>(null);
  const session = useScanSession();
  const uncropped = uncroppedCount(session);
  // Uncropped receipts wait for the Member, not for a read.
  const reading = pendingCount(session) - uncropped;
  /** The gallery receipt being cropped. */
  const [cropping, setCropping] = useState<SessionScan | null>(null);
  const [cropFailed, setCropFailed] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  // The Crop button is gone once the card is read: keep the focus on the card.
  useEffect(() => {
    if (!focusId) return;
    document.querySelector<HTMLElement>(`[data-scan-id="${focusId}"]`)?.focus();
    // oxlint-disable-next-line react/set-state-in-effect -- one-shot focus request: consumed (cleared) once the card is focused
    setFocusId(null);
  }, [focusId]);

  /** A card has just left the session (removed, or a dish picked): focus the next or previous card and let held-back scans go on. */
  const afterRemoved = (scan: SessionScan) => {
    const index = session.scans.indexOf(scan);
    const next = session.scans[index + 1] ?? session.scans[index - 1];
    settings.afterRemove?.(session.scans.length - 1);
    setFocusId(next?.id ?? null);
    // Scans held back by the Scan Cap can go on now.
    readScans();
  };

  const crop = async ({ area, rotation }: ReceiptCrop) => {
    const scan = cropping;
    setCropping(null);
    if (!scan?.source) return;
    try {
      const image = await cropToReceiptArea(scan.source, area, rotation);
      setCropFailed(null);
      dispatchScanSession({ type: 'crop', id: scan.id, image });
      setFocusId(scan.id);
      readScans();
    } catch {
      setCropFailed(scan.id);
    }
  };

  // A Plate Scan still showing its dish guesses has nothing to save yet.
  const savable = (scan: SessionScan) => scan.status === 'read' && !scan.dishes;
  const anyRead = session.scans.some(savable);
  // Everything is read: the olive banner counts the lines Add all will save and the ones to check.
  const allRead = session.scans.length > 0 && session.scans.every(savable);
  const readLines = session.scans.flatMap(savableLines);
  const unsure = unsureCount(readLines);
  // Photos saved over every press of Add, for the toast.
  const added = useRef(0);

  /**
   * Saves each read card in turn, trying all of them; the cards that fail stay with their error.
   * A card with nothing to save is dropped; one the API would refuse stays, with the reason.
   */
  const addAll = async () => {
    setSaving(true);
    setErrors({});
    let notTicked = 0;
    const fail = (id: string, message: string) =>
      setErrors((was) => ({ ...was, [id]: message }));
    for (const scan of getScanSession().scans) {
      // Opened and saved in the editor, or removed, since Add started.
      if (!getScanSession().scans.some((s) => s.id === scan.id)) continue;
      if (!savable(scan)) continue;
      const lines = savableLines(scan);
      if (lines.length === 0) {
        dispatchScanSession({ type: 'remove', id: scan.id });
        continue;
      }
      if (lines.some((line) => invalidFields(line).length > 0)) {
        fail(scan.id, t('overview.fixValues'));
        continue;
      }
      if (lines.length > MAX_BULK_BATCHES) {
        fail(
          scan.id,
          t('tooMany', {
            max: MAX_BULK_BATCHES,
            over: lines.length - MAX_BULK_BATCHES,
          }),
        );
        continue;
      }
      try {
        const failures = await saveScan(scan);
        if (failures)
          notTicked += failures.missing + failures.changed + failures.other;
        dispatchScanSession({ type: 'remove', id: scan.id });
        added.current += 1;
      } catch (error) {
        fail(scan.id, translateApiError(tAll, error));
        continue;
      }
      settings.onCardSaved?.(lines.length);
    }
    setSaving(false);
    // Failed reads are dropped with the rest; only a card whose save failed keeps the Member here.
    if (getScanSession().scans.some((scan) => scan.status === 'read')) return;
    resetScanSession();
    if (settings.afterAddAll) settings.afterAddAll(added.current, notTicked);
    else navigate('/scan', { state: { added: added.current, notTicked } });
  };
  /** Files picked with Add from photos join the end of the Scan Session, read in the last-used Scan Mode. */
  const addFromPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (picked.length === 0) return;
    importPhotos(picked, {
      mode: loadLastScanMode(),
      scanLanguage,
      onFull: () =>
        toast.show(tScan('limit', { count: MAX_SESSION_SCANS }), {
          polite: true,
        }),
      onInvalid: () =>
        toast.show(tAll('errors:scan.image_invalid'), { polite: true }),
    });
  };
  const discardAll = () => {
    resetScanSession();
    if (settings.afterDiscardAll) settings.afterDiscardAll();
    else navigate('/scan', { state: { discarded: true } });
  };

  const card = (scan: SessionScan) => {
    const display = scanDisplayState(scan);
    const isFailed = display === 'failed';
    const isReading = display === 'reading';
    const barcode = isBarcodeCard(scan);
    // Lines Receipt Scan left out are not saved, so they are not counted or shown.
    const lines: ReviewLine[] = savableLines(scan);
    const check = unsureCount(lines);
    const mergeable = canMerge(session, scan.id);
    // A not-found Barcode card's empty line has no name to show yet.
    const firstName = lines.length > 0 ? displayName(lines[0]).trim() : '';
    const result =
      (scan.mode === 'product' || barcode) && firstName
        ? firstName
        : t('overview.items', { count: lines.length });
    return (
      <Box
        component="li"
        key={scan.id}
        data-testid="review-card"
        id={cardId(scan.id)}
        data-scan-id={scan.id}
        tabIndex={-1}
        sx={{
          '&:focus-visible': {
            outline: `2px solid ${tokens.color.accentMid}`,
            outlineOffset: 2,
          },
          position: 'relative',
          display: 'flex',
          gap: 1.5,
          p: 1.5,
          borderRadius: radius.card,
          border: `1px solid ${tokens.color.line}`,
          backgroundColor: tokens.color.surface,
        }}
      >
        <Box
          component="img"
          src={scan.thumbnail}
          alt=""
          sx={{
            flex: 'none',
            width: 56,
            height: 72,
            borderRadius: nestedRadius(radius.control, 2),
            objectFit: 'cover',
          }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: tokens.color.accent,
            }}
          >
            {tScan(`mode.${scan.mode}`)}
          </Typography>
          {isReading ? (
            <Box
              role="status"
              sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}
            >
              {/* The line beside Gator says what it is doing, so the image is decorative. */}
              <Gator
                mood="list-keeper"
                size={64}
                loop="signature"
                entrance={false}
                decorative
              />
              <Typography>{t('overview.reading')}</Typography>
            </Box>
          ) : scan.dishes ? (
            <PlateChoice scan={scan} onPicked={() => afterRemoved(scan)} />
          ) : isFailed ? (
            <>
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}
              >
                <Gator
                  mood="worried"
                  size={48}
                  entrance={false}
                  alt={gatorAlt('worried')}
                />
                <Typography sx={{ fontWeight: 700 }}>
                  {t(`overview.${failedCopyKey(scan)}`)}
                </Typography>
              </Box>
              {isHeld(scan) ? (
                <Typography sx={{ fontSize: 13 }}>
                  {tScan(
                    scan.failure === 'credits' ? 'outOfCredits' : 'capReached',
                  )}
                </Typography>
              ) : showsErrorCopy(scan) ? (
                <Typography sx={{ fontSize: 13 }}>
                  {tScan(`errors:${scan.errorCode}`, scan.errorParams)}
                </Typography>
              ) : null}
              <Box sx={{ position: 'relative', zIndex: 1, mt: 0.75 }}>
                {canRetry(scan) ? (
                  <Box
                    component="button"
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      dispatchScanSession({ type: 'retry', id: scan.id });
                      readScans();
                      // The button goes while the read runs: keep focus on the card.
                      setFocusId(scan.id);
                    }}
                    sx={linkButton}
                  >
                    {tScan(barcode ? 'review.lookUpAgain' : 'review.readAgain')}
                  </Box>
                ) : null}
                <Box
                  component="button"
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    dispatchScanSession({ type: 'remove', id: scan.id });
                    // Scans held back by the Scan Cap can go on now.
                    readScans();
                    if (!barcode) navigate(cameraPath);
                  }}
                  sx={linkButton}
                >
                  {t(barcode ? 'overview.removeCard' : 'overview.retake')}
                </Box>
              </Box>
            </>
          ) : display === 'uncropped' ? (
            <>
              <Box
                component="button"
                type="button"
                onClick={() => setCropping(scan)}
                sx={{
                  display: 'block',
                  p: 0,
                  mt: 0.5,
                  border: 0,
                  background: 'none',
                  color: tokens.color.accent,
                  font: 'inherit',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t('overview.crop')}
              </Box>
              {cropFailed === scan.id ? (
                <Alert>{t('errors:scan.image_invalid')}</Alert>
              ) : null}
            </>
          ) : (
            <>
              <Box
                component="button"
                type="button"
                data-testid="card-result"
                disabled={saving}
                onClick={() => navigate(cardPath(scan.id))}
                sx={{
                  display: 'block',
                  p: 0,
                  mt: 0.5,
                  border: 0,
                  background: 'none',
                  color: 'inherit',
                  font: 'inherit',
                  fontWeight: 700,
                  textAlign: 'left',
                  cursor: 'pointer',
                  // Stretch the button over the whole card.
                  '&::after': { content: '""', position: 'absolute', inset: 0 },
                }}
              >
                {result}
              </Box>
              <Box
                component="ul"
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 0.5,
                  m: 0,
                  mt: 0.75,
                  p: 0,
                  listStyle: 'none',
                }}
              >
                {lines.slice(0, MAX_CHIPS).map((line, index) => (
                  <Box
                    component="li"
                    key={index}
                    data-testid="card-chip"
                    sx={{
                      px: '10px',
                      py: '2px',
                      borderRadius: radius.pill,
                      fontSize: 12,
                      backgroundColor: tokens.color.accentTint,
                      color: tokens.color.accentOnTint,
                    }}
                  >
                    {displayName(line)}
                  </Box>
                ))}
                {lines.length > MAX_CHIPS ? (
                  <Box component="li" sx={{ fontSize: 12 }}>
                    {t('overview.more', { count: lines.length - MAX_CHIPS })}
                  </Box>
                ) : null}
              </Box>
              {scan.sections || mergeable ? (
                <Box sx={{ position: 'relative', zIndex: 1, mt: 0.75 }}>
                  {mergeable ? (
                    <Box
                      component="button"
                      type="button"
                      onClick={() => {
                        dispatchScanSession({ type: 'merge', id: scan.id });
                        // The card above takes the merged Scan: focus it.
                        const index = session.scans.indexOf(scan);
                        setFocusId(session.scans[index - 1].id);
                      }}
                      sx={linkButton}
                    >
                      {t('overview.merge')}
                    </Box>
                  ) : null}
                  {scan.sections ? (
                    <Box
                      component="button"
                      type="button"
                      onClick={() => {
                        dispatchScanSession({ type: 'split', id: scan.id });
                        setFocusId(scan.sections?.[0].id ?? null);
                      }}
                      sx={linkButton}
                    >
                      {t('overview.split')}
                    </Box>
                  ) : null}
                </Box>
              ) : null}
              {check > 0 ? (
                <Typography
                  sx={{
                    mt: 0.75,
                    fontSize: 13,
                    fontWeight: 700,
                    color: tokens.color.urgentFg,
                  }}
                >
                  {t('overview.check', { count: check })}
                </Typography>
              ) : null}
              {errors[scan.id] ? (
                <Box sx={{ mt: 1 }}>
                  <Alert>{errors[scan.id]}</Alert>
                </Box>
              ) : null}
            </>
          )}
        </Box>
        {isReading ? null : (
          <Box
            component="button"
            type="button"
            aria-label={t('overview.remove')}
            disabled={saving}
            onClick={() => {
              dispatchScanSession({ type: 'remove', id: scan.id });
              afterRemoved(scan);
            }}
            sx={{
              position: 'relative',
              zIndex: 1,
              flex: 'none',
              alignSelf: 'flex-start',
              p: 0.5,
              border: 0,
              background: 'none',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            <CloseIcon size={18} />
          </Box>
        )}
      </Box>
    );
  };

  const content = (
    <div data-testid="review-overview">
      <Screen
        title={t('title')}
        status={[
          t('overview.photos', { count: session.scans.length }),
          reading + uncropped > 0
            ? t('overview.stillReading', { count: reading + uncropped })
            : t('overview.allRead'),
        ].join(' · ')}
        secondary={<Link href={cameraPath}>{t('overview.camera')}</Link>}
      />
      {allRead ? (
        <GatorBanner
          testId="all-read-banner"
          title={t('overview.banner', { count: readLines.length })}
          detail={
            unsure > 0
              ? t('overview.bannerCheck', { count: unsure })
              : t('overview.bannerClear', { count: readLines.length })
          }
        />
      ) : null}
      {session.scans.length === 0 ? (
        <Typography color="text.secondary">{t('overview.empty')}</Typography>
      ) : (
        <Box
          component="ul"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            m: 0,
            p: 0,
            listStyle: 'none',
          }}
        >
          {session.scans.map(card)}
        </Box>
      )}
      {session.scans.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: importOffered ? '1fr 1fr' : '1fr',
            gap: '10px',
            mt: 1.5,
          }}
        >
          <Button
            variant="ghost"
            startIcon={<CameraIcon size={20} />}
            disabled={saving}
            onClick={() => navigate(cameraPath)}
            sx={dashedButton}
          >
            {tScan('review.takeMore')}
          </Button>
          {importOffered ? (
            <>
              <Button
                variant="ghost"
                startIcon={<ImagePlusIcon size={20} />}
                disabled={saving}
                onClick={() => photosInput.current?.click()}
                sx={dashedButton}
              >
                {tScan('review.addFromPhotos')}
              </Button>
              <Box
                component="input"
                ref={photosInput}
                type="file"
                accept="image/*"
                multiple
                onChange={addFromPhotos}
                data-testid="review-photos-input"
                sx={{ display: 'none' }}
              />
            </>
          ) : null}
        </Box>
      ) : null}
      {session.scans.length > 0 ? (
        <Box sx={{ display: 'flex', gap: 1.5, mt: 2 }}>
          <Button
            onClick={() => void addAll()}
            disabled={reading > 0 || uncropped > 0 || saving || !anyRead}
          >
            {reading > 0
              ? t('overview.addWaiting', { count: reading })
              : uncropped > 0
                ? t('overview.cropFirst', { count: uncropped })
                : t('overview.add')}
          </Button>
          <Button variant="secondary" onClick={discardAll} disabled={saving}>
            {t('overview.discardAll')}
          </Button>
        </Box>
      ) : null}
      {cropping?.source ? (
        <ReceiptCropper
          photo={cropping.source}
          onConfirm={(value) => void crop(value)}
          onCancel={() => setCropping(null)}
        />
      ) : null}
    </div>
  );
  return settings.renderFrame ? settings.renderFrame(content) : content;
}

import {
  Box,
  Button,
  SAFE_BOTTOM,
  SAFE_LEFT,
  SAFE_RIGHT,
  SAFE_TOP,
  Typography,
  tokens,
} from '@pocket-pantry/ui';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Cropper from 'react-easy-crop';
import { useTranslation } from 'react-i18next';
import type { Rect } from '../lib/image';
import { RECEIPT_GUIDE_ASPECT } from '../lib/receiptGuide';

/** What the Member framed: the crop in the rotated photo's pixels, and the rotation it was made at. */
export type ReceiptCrop = { area: Rect; rotation: number };

const FINE_ROTATION_LIMIT = 15;

const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside the dialog: from the last control it wraps to the first, and back. */
function trapFocus(
  event: KeyboardEvent<HTMLElement>,
  dialog: HTMLElement | null,
) {
  const items = Array.from(
    dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
  ).sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === dialog)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * The crop step for a receipt photo from the gallery: pan, zoom and rotate the photo under a
 * fixed 1:3 frame (the same shape as the camera guide). Reusable per photo.
 */
export function ReceiptCropper({
  photo,
  onConfirm,
  onCancel,
}: {
  photo: Blob;
  onConfirm: (crop: ReceiptCrop) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('scan');
  const [url, setUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [quarterTurns, setQuarterTurns] = useState(0);
  const [fine, setFine] = useState(0);
  const [area, setArea] = useState<Rect | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo);
    // oxlint-disable-next-line react/set-state-in-effect -- the object URL is an external resource created and revoked with the effect
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);

  const rotation = quarterTurns * 90 + fine;

  // Dialog a11y: focus moves in on open and goes back to where it was on close.
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    dialog.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  return (
    <Box
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={t('crop.title')}
      tabIndex={-1}
      // Always dark like the camera screen, whatever the Member's Theme.
      data-theme="dark"
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') onCancel();
        if (event.key === 'Tab') trapFocus(event, dialog.current);
      }}
      sx={{
        outline: 'none',
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column',
        colorScheme: 'dark',
        // Full screen over the PageLayout band: clear the island, the notch and the home indicator.
        pt: SAFE_TOP,
        pb: SAFE_BOTTOM,
        pl: SAFE_LEFT,
        pr: SAFE_RIGHT,
        backgroundColor: tokens.color.bg,
        color: tokens.color.ink,
      }}
    >
      <Typography sx={{ p: 2, textAlign: 'center', fontSize: 14 }}>
        {t('crop.instruction')}
      </Typography>
      <Box sx={{ position: 'relative', flex: 1 }}>
        {url ? (
          <Cropper
            image={url}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={RECEIPT_GUIDE_ASPECT}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
          />
        ) : null}
      </Box>
      <Box sx={{ px: 3, pt: 2 }}>
        <Box
          component="label"
          sx={{ display: 'block', fontSize: 13, textAlign: 'center' }}
        >
          {t('crop.fine', { degrees: fine })}
          <Box
            component="input"
            type="range"
            min={-FINE_ROTATION_LIMIT}
            max={FINE_ROTATION_LIMIT}
            step={1}
            value={fine}
            onChange={(event) => setFine(Number(event.target.value))}
            sx={{
              display: 'block',
              width: '100%',
              accentColor: tokens.color.accent,
            }}
          />
        </Box>
      </Box>
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          justifyContent: 'center',
          flexWrap: 'wrap',
          p: 2,
        }}
      >
        <Button
          variant="ghost"
          sx={{ color: tokens.color.ink }}
          onClick={() => onCancel()}
        >
          {t('crop.cancel')}
        </Button>
        <Button
          variant="ghost"
          sx={{ color: tokens.color.ink }}
          onClick={() => setQuarterTurns((turns) => (turns + 3) % 4)}
        >
          {t('crop.rotateLeft')}
        </Button>
        <Button
          variant="ghost"
          sx={{ color: tokens.color.ink }}
          onClick={() => setQuarterTurns((turns) => (turns + 1) % 4)}
        >
          {t('crop.rotateRight')}
        </Button>
        <Button
          disabled={!area}
          onClick={() => area && onConfirm({ area, rotation })}
        >
          {t('crop.confirm')}
        </Button>
      </Box>
    </Box>
  );
}

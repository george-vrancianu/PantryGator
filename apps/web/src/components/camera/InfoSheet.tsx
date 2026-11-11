import {
  Box,
  Button,
  Dialog,
  Typography,
  tokens,
  radius,
} from '@pocket-pantry/ui';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CAMERA_MODES, type CameraMode } from '../../lib/cameraMode';
import { glassFocusRing, shade, translucent } from './glass';
import { insetBottom, useCameraFrame } from './CameraFrame';

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The Info bottom sheet over the camera. Tab stays inside it, Escape or a scrim tap closes it,
 * and focus goes back to whatever opened it.
 */
export function InfoSheet({
  onClose,
  modes = CAMERA_MODES,
  stackTip = true,
}: {
  onClose: () => void;
  /** The modes to describe, in slider order: the add-Batch camera has only Product and Barcode. */
  modes?: readonly CameraMode[];
  /** The tip about the photo stack; the add-Batch camera has no stack. */
  stackTip?: boolean;
}) {
  const { t } = useTranslation('scan');
  const { layout } = useCameraFrame();
  const sheet = useRef<HTMLDivElement>(null);

  const asDialog = layout === 'rail';
  useEffect(() => {
    // The Dialog traps focus, closes on Escape and returns focus itself.
    if (asDialog) return;
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(sheet.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    // No scroll: the sheet is still sliding in, and scrolling the camera root would shift the feed.
    focusables()[0]?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return onClose();
      if (event.key !== 'Tab') return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = sheet.current?.contains(active);
      if (!inside || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      opener?.focus();
    };
  }, [onClose, asDialog]);

  if (asDialog) {
    return (
      <Dialog
        open
        centred
        // The camera is always dark; the dialog portals out of its subtree.
        theme="dark"
        onClose={onClose}
        title={t('info.title')}
        actions={<Button onClick={onClose}>{t('info.ok')}</Button>}
      >
        <InfoBody modes={modes} stackTip={stackTip} />
      </Dialog>
    );
  }

  return (
    <Box
      data-testid="info-scrim"
      onClick={onClose}
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'flex-end',
        backgroundColor: shade(45),
      }}
    >
      <Box
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-info-title"
        onClick={(event) => event.stopPropagation()}
        sx={{
          width: '100%',
          p: 3,
          pt: 1.5,
          pb: `calc(24px + ${insetBottom})`,
          borderRadius: `${radius.card} ${radius.card} 0 0`,
          backgroundColor: translucent(tokens.color.surface, 82),
          backdropFilter: 'blur(14px)',
          color: tokens.color.ink,
        }}
      >
        <Box
          aria-hidden="true"
          sx={{
            width: 36,
            height: 4,
            mx: 'auto',
            mb: 2,
            borderRadius: radius.pill,
            backgroundColor: tokens.color.muted,
          }}
        />
        <Typography
          id="scan-info-title"
          component="h2"
          sx={{ fontSize: 18, fontWeight: 700 }}
        >
          {t('info.title')}
        </Typography>
        <InfoBody modes={modes} stackTip={stackTip} />
        <Box
          component="button"
          type="button"
          onClick={onClose}
          sx={{
            mt: 2,
            height: 44,
            width: '100%',
            border: 0,
            borderRadius: radius.pill,
            fontFamily: 'inherit',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: tokens.color.accent,
            color: tokens.color.bg,
            '&:focus-visible': glassFocusRing,
          }}
        >
          {t('info.ok')}
        </Box>
      </Box>
    </Box>
  );
}

/** What the Info sheet and the Info dialog say: the intro, one line per mode, the stack tip. */
function InfoBody({
  modes,
  stackTip,
}: {
  modes: readonly CameraMode[];
  stackTip: boolean;
}) {
  const { t } = useTranslation('scan');
  return (
    <>
      <Typography sx={{ mt: 1, fontSize: 14, color: tokens.color.muted }}>
        {t('info.intro')}
      </Typography>
      <Box
        component="ul"
        sx={{ mt: 1.5, mb: 0, p: 0, listStyle: 'none', fontSize: 14 }}
      >
        {modes.map((mode) => (
          <Box component="li" key={mode} sx={{ mt: 0.75 }}>
            <strong>{t(`mode.${mode}`)}</strong>{' '}
            <Box component="span" sx={{ color: tokens.color.muted }}>
              {t(mode === 'barcode' ? 'info.barcode' : `detail.${mode}`)}
            </Box>
            {mode === 'receipt'
              ? (['guide.receipt', 'guide.receiptFold'] as const).map((key) => (
                  <Box key={key} sx={{ mt: 0.5, color: tokens.color.muted }}>
                    {t(key)}
                  </Box>
                ))
              : null}
          </Box>
        ))}
      </Box>
      {stackTip ? (
        <Typography sx={{ mt: 1.5, fontSize: 14, color: tokens.color.muted }}>
          {t('info.tip')}
        </Typography>
      ) : null}
    </>
  );
}

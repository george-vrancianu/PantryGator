import { Box, Sheet, Typography, tokens } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { CAMERA_MODES, type CameraMode } from '../../lib/cameraMode';
import { isBarcodeMode } from '../../lib/cameraMode';

/**
 * The Info sheet over the camera: a content-sized Sheet on every screen size
 * (a bottom sheet on a phone, a dialog from `md` up).
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
  return (
    <Sheet
      open
      size="content"
      onClose={onClose}
      title={t('info.title')}
      primary={{ label: t('info.ok'), onClick: onClose }}
    >
      <InfoBody modes={modes} stackTip={stackTip} />
    </Sheet>
  );
}

/** What the Info sheet says: the intro, one line per mode, the stack tip. */
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
      <Typography sx={{ fontSize: 14, color: tokens.color.muted }}>
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
              {t(isBarcodeMode(mode) ? 'info.barcode' : `detail.${mode}`)}
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

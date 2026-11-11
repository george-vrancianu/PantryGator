import {
  Box,
  Button,
  CheckIcon,
  gutterLeft,
  gutterRight,
  palette,
  plusBottomInset,
  Typography,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { keyframesSx } from '../../lib/keyframesSx';

function Spinner() {
  return (
    <Box
      aria-hidden
      sx={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        border: '2px solid currentColor',
        borderRightColor: 'transparent',
        ...keyframesSx('pp-voice-spin', '700ms linear infinite', {
          from: { transform: 'rotate(0)' },
          to: { transform: 'rotate(360deg)' },
        }),
      }}
    />
  );
}

/**
 * Review's footer: Discard and Apply; the Discard question in their place once
 * asked; or only a full-width Discard when there is nothing to apply.
 */
export function ReviewFooter({
  count,
  blocked,
  invalid,
  applying,
  confirming,
  onAsk,
  onKeep,
  onDiscard,
  onApply,
  onBlockedApply,
  applyLabel,
  merged = false,
}: {
  /** The changes Apply would send. */
  count: number;
  /** What holds Apply back, if anything. */
  blocked: 'list' | 'batch' | 'place' | null;
  /** An amount that can't be read. */
  invalid: boolean;
  applying: boolean;
  confirming: boolean;
  onAsk: () => void;
  onKeep: () => void;
  onDiscard: () => void;
  onApply: () => void;
  onBlockedApply: () => void;
  /** Words for the Apply button when it is ready, in place of "Apply N changes" (Say it says "Do these N"). */
  applyLabel?: string;
  /** Review all: the Discard question is about all the merged Voice Notes. */
  merged?: boolean;
}) {
  const { t } = useTranslation('voice');
  const confirmKey = merged
    ? 'review.footer.confirmAll'
    : 'review.footer.confirm';
  const box = {
    pt: '12px',
    pl: gutterLeft(16),
    pr: gutterRight(16),
    pb: plusBottomInset(20),
  };

  if (confirming) {
    return (
      <Box sx={box} role="group" aria-label={t(confirmKey)}>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
          {t(confirmKey)}
        </Typography>
        <Typography
          sx={{ fontSize: 12.5, color: palette('text-secondary'), mb: '10px' }}
        >
          {t(
            merged
              ? 'review.footer.confirmAllHint'
              : 'review.footer.confirmHint',
          )}
        </Typography>
        <Box sx={{ display: 'flex', gap: '10px' }}>
          <Button
            variant="secondary"
            onClick={onKeep}
            sx={{ flex: 1 }}
            autoFocus
            disabled={applying}
          >
            {t('review.footer.keep')}
          </Button>
          <Button
            variant="danger"
            onClick={onDiscard}
            disabled={applying}
            sx={{ flex: 1 }}
          >
            {t('review.footer.discard')}
          </Button>
        </Box>
      </Box>
    );
  }

  if (count === 0 && blocked === null) {
    return (
      <Box sx={box}>
        <Button fullWidth onClick={onAsk} data-voice-discard>
          {t('review.footer.discard')}
        </Button>
      </Box>
    );
  }

  const label = applying
    ? t('review.footer.applying')
    : blocked === 'list'
      ? t('review.footer.pickList')
      : blocked === 'batch'
        ? t('review.footer.pickBatch')
        : blocked === 'place'
          ? t('review.footer.pickPlace')
          : (applyLabel ?? t('review.footer.apply', { count }));

  return (
    <Box sx={{ ...box, display: 'flex', gap: '10px' }}>
      <Button
        variant="secondary"
        disabled={applying}
        onClick={onAsk}
        data-voice-discard
      >
        {t('review.footer.discard')}
      </Button>
      <Button
        sx={{ flex: 1, ...(blocked ? { opacity: 0.55 } : {}) }}
        disabled={applying || (blocked === null && invalid)}
        aria-disabled={blocked !== null ? true : undefined}
        startIcon={
          applying ? <Spinner /> : blocked ? null : <CheckIcon size={18} />
        }
        onClick={blocked !== null ? onBlockedApply : onApply}
      >
        {label}
      </Button>
    </Box>
  );
}

import {
  Box,
  Button,
  gutterLeft,
  gutterRight,
  plusBottomInset,
  tokens,
} from '@pocket-pantry/ui';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBubbleBottomBound } from './layout/useBubbleBottomBound';

type Props = {
  saveLabel: string;
  canSave: boolean;
  onSave: () => void;
  onDiscard: () => void;
  /** The left button's label; "Discard" unless a screen has its own word for leaving (Setup says "Retake"). */
  discardLabel?: string;
};

/** Fixed to the bottom in place of the Dock; clear of the home indicator on phones. */
export function ReviewActionBar({
  saveLabel,
  canSave,
  onSave,
  onDiscard,
  discardLabel,
}: Props) {
  const { t } = useTranslation('review');
  const bar = useRef<HTMLDivElement>(null);
  useBubbleBottomBound(bar);
  return (
    <Box
      ref={bar}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10,
        bgcolor: tokens.color.surface,
        borderTop: `1px solid ${tokens.color.line}`,
        pt: '12px',
        pl: gutterLeft(16),
        pr: gutterRight(16),
        pb: plusBottomInset(24),
      }}
    >
      <Box sx={{ display: 'flex', gap: '10px', maxWidth: 960, mx: 'auto' }}>
        <Button
          variant="ghost"
          onClick={onDiscard}
          sx={{
            height: 52,
            bgcolor: tokens.color.surface,
            border: `1px solid ${tokens.color.line}`,
            color: tokens.color.ink,
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          {discardLabel ?? t('discard')}
        </Button>
        <Button
          onClick={onSave}
          disabled={!canSave}
          sx={{ flexGrow: 1, fontSize: 15, fontWeight: 700 }}
        >
          {saveLabel}
        </Button>
      </Box>
    </Box>
  );
}

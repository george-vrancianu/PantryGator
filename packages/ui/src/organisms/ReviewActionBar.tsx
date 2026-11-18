import type { Ref } from 'react';
import { Button } from '../atoms/Button';
import { Box } from '../atoms/Layout';
import { gutterLeft, gutterRight, plusBottomInset } from '../theme/safeArea';
import { palette } from '../theme/themeVars';

export type ReviewActionBarProps = {
  saveLabel: string;
  /** The left button's label ("Discard", or a screen's own word for leaving, such as "Retake"). */
  discardLabel: string;
  /** The bar's element, for the app to measure (it keeps the Gator bubble above the bar). */
  ref?: Ref<HTMLDivElement>;
  canSave: boolean;
  onSave: () => void;
  onDiscard: () => void;
};

/** Fixed to the bottom in place of the Dock; clear of the home indicator on phones. */
export function ReviewActionBar({
  saveLabel,
  canSave,
  onSave,
  onDiscard,
  discardLabel,
  ref,
}: ReviewActionBarProps) {
  return (
    <Box
      ref={ref}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10,
        bgcolor: palette('background-paper'),
        borderTop: `1px solid ${palette('pp-line')}`,
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
            bgcolor: palette('background-paper'),
            border: `1px solid ${palette('pp-line')}`,
            color: palette('text-primary'),
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          {discardLabel}
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

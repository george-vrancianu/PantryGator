import type { ReactNode } from 'react';
import { Box } from '../atoms/Layout';
import { ArrowLeftIcon } from '../atoms/icons';
import { radius } from '../theme/themeVars';
import { tokens } from '../theme/tokens';
import { usePrefersReducedMotion } from '../theme/usePrefersReducedMotion';

const FADE_MS = 250;

export type RowHintPillProps = {
  /**
   * Shown or not. The pill always keeps its space, so the page below does not jump when it appears or
   * fades: hidden, it is invisible, inert and out of the accessibility tree.
   */
  visible: boolean;
  /** The hint, e.g. "Swipe left to remove · hold to edit". */
  children: ReactNode;
};

/**
 * The first-use hint under a list's header (handoff section 7): a small pill telling the Member how the
 * row gestures work. It fades over 250 ms (instantly under reduce-motion) and keeps its space.
 */
export function RowHintPill({ visible, children }: RowHintPillProps) {
  const reduceMotion = usePrefersReducedMotion();
  return (
    <Box
      data-row-hint=""
      aria-hidden={visible ? 'false' : 'true'}
      sx={{
        display: 'flex',
        justifyContent: 'center',
        my: 1,
        opacity: visible ? 1 : 0,
        visibility: visible ? 'visible' : 'hidden',
        transition: reduceMotion
          ? 'none'
          : `opacity ${FADE_MS}ms, visibility 0s ${visible ? '0s' : `${FADE_MS}ms`}`,
        pointerEvents: 'none',
      }}
    >
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          px: '12px',
          py: '7px',
          borderRadius: radius.chip,
          bgcolor: tokens.color.accentTint,
          color: tokens.color.accentOnTint,
          fontSize: 12.5,
          fontWeight: 600,
        }}
      >
        <ArrowLeftIcon size={14} aria-hidden="true" />
        {children}
      </Box>
    </Box>
  );
}

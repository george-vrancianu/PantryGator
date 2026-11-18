import { Box, tokens } from '@pocket-pantry/ui';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { linkButtonSx } from '../layout';

type Props = {
  kind: 'review' | 'sure';
  count: number;
  /** "Sigure" only: whether its rows show, and how to flip that. */
  expanded?: boolean;
  onToggle?: () => void;
  /** Shown instead of the rows while "Sigure" is collapsed. */
  summary?: string;
  children: ReactNode;
};

/** A titled run of rows. "Sigure" can collapse to one line of names. */
export function ReviewGroup({
  kind,
  count,
  expanded = true,
  onToggle,
  summary,
  children,
}: Props) {
  const { t } = useTranslation('review');
  const listId = useId();
  const collapsible = kind === 'sure' && onToggle !== undefined;
  return (
    <Box component="section" aria-label={t(`group.${kind}`)}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 40,
          px: '12px',
          bgcolor: tokens.color.subtle,
          borderTop: `1px solid ${tokens.color.divider}`,
        }}
      >
        <Box
          component="h2"
          sx={{
            m: 0,
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color:
              kind === 'review' ? tokens.color.urgentFg : tokens.color.accent,
          }}
        >
          {`${t(`group.${kind}`)} · ${count}`}
        </Box>
        {collapsible ? (
          <Box
            component="button"
            type="button"
            aria-expanded={expanded}
            aria-controls={expanded ? listId : undefined}
            onClick={onToggle}
            sx={linkButtonSx}
          >
            {t(expanded ? 'group.collapse' : 'group.expand')}
          </Box>
        ) : null}
      </Box>
      {expanded ? (
        <Box id={listId} component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {children}
        </Box>
      ) : (
        <Box
          sx={{
            px: '12px',
            py: '10px',
            fontSize: 13,
            color: tokens.color.muted,
            borderTop: `1px solid ${tokens.color.divider}`,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {summary}
        </Box>
      )}
    </Box>
  );
}

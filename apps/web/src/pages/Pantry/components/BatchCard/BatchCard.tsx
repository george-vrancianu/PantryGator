import { Box, color, radius, shadow } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';

/** The one card that holds a Batch in the Add to Pantry sheet: Amount, Where it goes, Expires, Note. */
export function BatchCard({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        p: '14px',
        backgroundColor: color.cardBg,
        border: `1px solid ${color.cardLine}`,
        borderRadius: radius.card,
        boxShadow: shadow.card,
      }}
    >
      {children}
    </Box>
  );
}

/** A section of the card: a caps label (with an optional hint at the right) over its content. */
export function CardSection({
  label,
  hint,
  labelId,
  children,
}: {
  label: string;
  /** Shown when the value is the usual one. */
  hint?: string | null;
  labelId?: string;
  children: ReactNode;
}) {
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 1,
          mb: '6px',
        }}
      >
        <Box
          id={labelId}
          sx={{
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'text.secondary',
          }}
        >
          {label}
        </Box>
        {hint ? (
          <Box
            sx={{ fontSize: 12, fontWeight: 600, color: color.accentOnTint }}
          >
            {hint}
          </Box>
        ) : null}
      </Box>
      {children}
    </Box>
  );
}

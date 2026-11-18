import { Box, Gator, radius, Typography } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { useGatorAlt } from '@/lib/useGatorAlt';

type Props = {
  children: ReactNode;
  /** Set where the line should be announced when it changes (Snap's follows the pick). */
  live?: boolean;
  /** Space above the bubble. */
  mt?: string;
};

/** The talking Gator with a cream speech bubble, the lead of every olive Setup screen. */
export function GatorSpeech({ children, live = false, mt = '20px' }: Props) {
  const gatorAlt = useGatorAlt();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mt }}>
      <Box sx={{ flexShrink: 0 }}>
        <Gator
          mood="talking"
          size={132}
          loop="signature"
          alt={gatorAlt('talking')}
        />
      </Box>
      <Typography
        role={live ? 'status' : undefined}
        sx={{
          flex: 1,
          px: '16px',
          py: '14px',
          borderRadius: radius.sheet,
          backgroundColor: 'pp.cardBg',
          color: 'text.primary',
          fontSize: 15.5,
          fontWeight: 600,
        }}
      >
        {children}
      </Typography>
    </Box>
  );
}

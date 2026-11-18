import { Box, Gator, tokens } from '@pocket-pantry/ui';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { GatorBubblePanel } from '../GatorBubblePanel/GatorBubblePanel';

/**
 * Gator's empty-pot panel for a Family with no Recipes: the chef whole on the accent tint, his line
 * in a bubble beside him. Not a link; Gator is a button that plays his Tap.
 */
export function EmptyPotPanel() {
  const { t } = useTranslation('gator');
  const [taps, setTaps] = useState(0);
  return (
    <GatorBubblePanel
      gator={
        <Box
          component="button"
          type="button"
          aria-label={t('chef.alt')}
          onClick={() => setTaps((n) => n + 1)}
          sx={{
            display: 'block',
            p: 0,
            border: 0,
            background: 'none',
            cursor: 'pointer',
          }}
        >
          <Gator
            mood="chef"
            size={170}
            loop="signature"
            tapSignal={taps}
            decorative
          />
        </Box>
      }
    >
      <Trans
        t={t}
        i18nKey="chef.emptyFamily"
        components={{
          b: (
            <Box
              component="b"
              sx={{ fontWeight: 700, color: tokens.color.accentOnTint }}
            />
          ),
        }}
      />
    </GatorBubblePanel>
  );
}

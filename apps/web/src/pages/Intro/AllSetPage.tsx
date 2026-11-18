import {
  Box,
  Button,
  color,
  displayType,
  Gator,
  MicIcon,
  palette,
  radius,
  ReceiptIcon,
  Typography,
} from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IntroCanopy } from '@/components/intro/IntroCanopy/IntroCanopy';
import { useGatorAlt } from '@/lib/useGatorAlt';
import { useIntro } from '@/lib/useIntro';

/** One stat: the number big, what it counts below. Hidden by the page at 0. */
function Tile({ count, label }: { count: number; label: string }) {
  return (
    <Box
      component="li"
      sx={{
        flex: 1,
        boxSizing: 'border-box',
        p: '16px',
        borderRadius: radius.card,
        backgroundColor: color.accentOnTint,
        color: color.cardBg,
        listStyle: 'none',
      }}
    >
      <Typography
        component="span"
        sx={{ display: 'block', fontSize: 30, lineHeight: 1.1, ...displayType }}
      >
        {count}
      </Typography>
      <Typography component="span" sx={{ display: 'block', fontSize: 15 }}>
        {label}
      </Typography>
    </Box>
  );
}

function Tip({ icon, children }: { icon: ReactNode; children: string }) {
  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '14px',
        listStyle: 'none',
      }}
    >
      <Box
        aria-hidden
        sx={{ flex: 'none', color: palette('pp-accent'), mt: '2px' }}
      >
        {icon}
      </Box>
      <Typography sx={{ fontSize: 15.5, lineHeight: 1.45 }}>
        {children}
      </Typography>
    </Box>
  );
}

/**
 * All set, the Intro's last screen (on the Canopy): Gator's bubble over the proud Gator, what Setup really put in
 * the Pantry and on the Shopping List (a tile at 0 is left out), two tips and "Go to my kitchen", which marks
 * the Intro done and opens the Dashboard. Nothing here moves, so there is nothing to switch off for reduced motion.
 */
export function AllSetPage() {
  const { t } = useTranslation('onboarding');
  const gatorAlt = useGatorAlt();
  const { counts, finishIntro, finishing, finishError } = useIntro();
  return (
    <IntroCanopy
      top={
        <>
          <Typography
            component="h1"
            sx={{
              position: 'relative',
              maxWidth: 280,
              mx: 'auto',
              px: '24px',
              py: '18px',
              textAlign: 'center',
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1.3,
              borderRadius: radius.sheet,
              backgroundColor: 'pp.cardBg',
              color: 'text.primary',
              '&::after': {
                content: '""',
                position: 'absolute',
                left: '50%',
                bottom: -7,
                width: 14,
                height: 14,
                transform: 'translateX(-50%) rotate(45deg)',
                backgroundColor: 'pp.cardBg',
              },
            }}
          >
            {t('allSet.bubble')}
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: '28px' }}>
            <Gator
              mood="proud"
              size={270}
              loop="signature"
              alt={gatorAlt('proud')}
            />
          </Box>
        </>
      }
    >
      {counts.batches > 0 || counts.shoppingItems > 0 ? (
        <Box component="ul" sx={{ display: 'flex', gap: '12px', m: 0, p: 0 }}>
          {counts.batches > 0 ? (
            <Tile count={counts.batches} label={t('allSet.inPantry')} />
          ) : null}
          {counts.shoppingItems > 0 ? (
            <Tile
              count={counts.shoppingItems}
              label={t('allSet.onShoppingList')}
            />
          ) : null}
        </Box>
      ) : null}

      <Box
        component="ul"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          m: 0,
          mt: '24px',
          p: 0,
        }}
      >
        <Tip icon={<ReceiptIcon size={22} />}>{t('allSet.tipReceipt')}</Tip>
        <Tip icon={<MicIcon size={22} />}>{t('allSet.tipMic')}</Tip>
      </Box>

      {finishError ? (
        <Typography role="alert" sx={{ mt: '24px', fontWeight: 600 }}>
          {t('allSet.error')}
        </Typography>
      ) : null}
      <Button
        fullWidth
        disabled={finishing}
        onClick={finishIntro}
        sx={{ mt: '32px', fontSize: 17, fontWeight: 700 }}
      >
        {t('allSet.go')}
      </Button>
    </IntroCanopy>
  );
}

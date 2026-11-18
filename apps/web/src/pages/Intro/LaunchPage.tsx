import {
  bodyFont,
  Box,
  Button,
  canopy,
  color as themeColor,
  displayType,
  Gator,
  Link,
  plusBottomInset,
  radius,
  SAFE_TOP,
  Typography,
  IntroLook,
} from '@pocket-pantry/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { CanopyTexture } from '@/components/layout/CanopyTexture/CanopyTexture';
import { INTRO_PATHS } from '@/lib/intro';
import { useGatorAlt } from '@/lib/useGatorAlt';

/** How far the sheet's top edge overlaps the Canopy (the board draws 74 under the sheet). */
const UNDER_SHEET = 74;
/** Between Gator's feet and the sheet's top edge. */
const SHEET_GAP = 18;

/** Gator's full size (the board's 336), and the share of the viewport height it may take so Get started stays above the fold. */
const GATOR_SIZE = 336;
const GATOR_MAX_VH = 0.38;

const fitGator = () =>
  Math.min(GATOR_SIZE, Math.round(window.innerHeight * GATOR_MAX_VH));

/** Gator's size: 336, scaled down on short phones (375x667 gets about 253). */
function useGatorSize() {
  const [size, setSize] = useState(fitGator);
  useEffect(() => {
    const onResize = () => setSize(fitGator());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/**
 * What a signed-out visitor sees on any route. "I already have an account" opens Log in and carries the
 * page they asked for, so Log in returns to it.
 */
export function LaunchPage() {
  const { t } = useTranslation(['onboarding', 'common']);
  const gatorAlt = useGatorAlt();
  const gatorSize = useGatorSize();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.pathname + location.search;
  const logIn = INTRO_PATHS['log-in'];

  return (
    <IntroLook ground="canopy">
      <Box
        sx={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Two-tone (Canopy handoff 7.8): the Canopy with its texture, the brand lockup and Gator, then the sheet. */}
        <Box
          data-region="canopy"
          sx={{
            position: 'relative',
            overflow: 'hidden',
            flex: '1 0 auto',
            display: 'flex',
            flexDirection: 'column',
            background: canopy.bg,
            backgroundColor: canopy.base,
            color: canopy.ink,
            pt: `calc(${SAFE_TOP} + 10px)`,
            pb: `${UNDER_SHEET + SHEET_GAP}px`,
          }}
        >
          <CanopyTexture texture="home" />
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              left: '50%',
              top: 176,
              width: 360,
              height: 360,
              ml: '-180px',
              borderRadius: radius.inherit,
              background: canopy.glow,
            }}
          />
          <Box
            sx={{
              position: 'relative',
              px: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '11px',
            }}
          >
            <Gator mood="app-icon" size={38} decorative />
            <Typography
              component="h1"
              sx={{
                ...displayType,
                fontSize: 19,
                fontWeight: 700,
                letterSpacing: '-0.03em',
                lineHeight: 1,
              }}
            >
              {t('common:appName')}
            </Typography>
          </Box>
          <Box
            sx={{
              position: 'relative',
              mt: 'auto',
              pt: '24px',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <Box
              aria-hidden
              sx={{
                position: 'absolute',
                left: '50%',
                bottom: -10,
                width: 240,
                height: 26,
                ml: '-120px',
                borderRadius: radius.inherit,
                backgroundColor: canopy.floorShadow,
                filter: 'blur(10px)',
              }}
            />
            <Gator
              mood="shopping-buddy"
              size={gatorSize}
              loop="signature"
              alt={gatorAlt('shopping-buddy')}
            />
          </Box>
        </Box>
        <Box
          component="main"
          sx={{
            position: 'relative',
            zIndex: 1,
            mt: `-${UNDER_SHEET}px`,
            boxSizing: 'border-box',
            p: '32px 24px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '28px',
            background: canopy.sheetBg,
            borderRadius: radius.introSheet,
            boxShadow: canopy.sheetShadow,
            color: 'text.primary',
          }}
        >
          <Typography
            sx={{
              ...displayType,
              fontSize: 31,
              fontWeight: 800,
              letterSpacing: '-0.04em',
              lineHeight: 1.08,
              textWrap: 'balance',
            }}
          >
            {t('onboarding:launch.tagline')} {t('onboarding:launch.taglineTwo')}
          </Typography>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              pb: plusBottomInset(34),
              width: '100%',
              maxWidth: 420,
              alignSelf: 'center',
            }}
          >
            <Button
              fullWidth
              href={INTRO_PATHS.languages}
              sx={{ height: 56, borderRadius: radius.btn, fontSize: 16 }}
            >
              {t('onboarding:launch.getStarted')}
            </Button>
            <Link
              href={logIn}
              onClick={(event) => {
                event.preventDefault();
                void navigate(logIn, { state: { from } });
              }}
              sx={{
                height: 48,
                display: 'grid',
                placeItems: 'center',
                fontFamily: bodyFont,
                fontSize: 15,
                fontWeight: 600,
                color: themeColor.ink2,
                textDecoration: 'none',
              }}
            >
              {t('onboarding:launch.haveAccount')}
            </Link>
          </Box>
        </Box>
      </Box>
    </IntroLook>
  );
}

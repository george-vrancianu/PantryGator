import {
  Box,
  Button,
  Gator,
  Link,
  SAFE_TOP,
  Stack,
  Typography,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { IntroLook } from '../../components/IntroLook';
import { INTRO_PATHS } from '../../lib/intro';
import { useGatorAlt } from '../../lib/useGatorAlt';

/**
 * What a signed-out visitor sees on any route. "I already have an account" opens Log in and carries the
 * page they asked for, so Log in returns to it.
 */
export function LaunchPage() {
  const { t } = useTranslation(['onboarding', 'common']);
  const gatorAlt = useGatorAlt();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.pathname + location.search;
  const logIn = INTRO_PATHS['log-in'];

  return (
    <IntroLook>
      <Box
        component="main"
        sx={{
          minHeight: `calc(100vh - ${SAFE_TOP})`,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: '24px',
          pt: '64px',
          pb: '40px',
        }}
      >
        <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
          <Gator
            mood="shopping-buddy"
            size={280}
            loop="signature"
            alt={gatorAlt('shopping-buddy')}
          />
          <Typography variant="h1">{t('common:appName')}</Typography>
          <Typography color="text.secondary">
            {t('onboarding:launch.tagline')}
            <br />
            {t('onboarding:launch.taglineTwo')}
          </Typography>
        </Stack>
        <Stack
          spacing={2}
          sx={{ width: '100%', maxWidth: 420, alignItems: 'center' }}
        >
          <Button fullWidth href={INTRO_PATHS.languages}>
            {t('onboarding:launch.getStarted')}
          </Button>
          <Link
            href={logIn}
            onClick={(event) => {
              event.preventDefault();
              void navigate(logIn, { state: { from } });
            }}
          >
            {t('onboarding:launch.haveAccount')}
          </Link>
        </Stack>
      </Box>
    </IntroLook>
  );
}

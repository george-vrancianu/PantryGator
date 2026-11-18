import {
  Box,
  canopy,
  Link,
  Stack,
  Typography,
  BrandLockup,
} from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IntroCanopy } from '@/components/intro/IntroCanopy/IntroCanopy';
import { LanguageSwitcher } from '../LanguageSwitcher/LanguageSwitcher';

type Props = {
  title: string;
  subtitle: string;
  /** The label of a link back to Launch (the Intro start); left out, there is none. */
  back?: string;
  /** Where the back link goes; Launch by default. */
  backHref?: string;
  /** The EN/RO/DA switch; sign-up leaves it out, because Languages already chose the language. */
  languageSwitcher?: boolean;
  children: ReactNode;
};

/** Frame shared by Log in and sign-up. Part of the Intro: the Canopy with the back link, language switch and brand lockup, then the sheet with the form, always in the light look. */
export function AuthShell({
  title,
  subtitle,
  back,
  backHref = '/',
  languageSwitcher = true,
  children,
}: Props) {
  const { t } = useTranslation('common');
  return (
    <IntroCanopy
      maxWidth={420}
      top={
        <Stack spacing={3}>
          {back || languageSwitcher ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              {back ? (
                <Link href={backHref} sx={{ color: canopy.ink }}>
                  {back}
                </Link>
              ) : null}
              {languageSwitcher ? (
                <Box sx={{ ml: 'auto' }}>
                  <LanguageSwitcher />
                </Box>
              ) : null}
            </Box>
          ) : null}
          <BrandLockup name={t('appName')} />
        </Stack>
      }
    >
      <Stack spacing={3}>
        <Stack spacing={0.5}>
          <Typography variant="h1">{title}</Typography>
          <Typography variant="meta" color="text.secondary">
            {subtitle}
          </Typography>
        </Stack>
        {children}
      </Stack>
    </IntroCanopy>
  );
}

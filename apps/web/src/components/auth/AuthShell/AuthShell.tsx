import {
  Box,
  CenteredLayout,
  Link,
  Stack,
  Typography,
} from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { BrandLockup } from '@/components/BrandLockup';
import { IntroLook } from '@/components/IntroLook';
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

/** Frame shared by Log in and sign-up. Part of the Intro, so always in the light look. */
export function AuthShell({
  title,
  subtitle,
  back,
  backHref = '/',
  languageSwitcher = true,
  children,
}: Props) {
  return (
    <IntroLook>
      <CenteredLayout>
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
              {back ? <Link href={backHref}>{back}</Link> : null}
              {languageSwitcher ? (
                <Box sx={{ ml: 'auto' }}>
                  <LanguageSwitcher />
                </Box>
              ) : null}
            </Box>
          ) : null}
          <BrandLockup />
          <Stack spacing={0.5}>
            <Typography variant="h1">{title}</Typography>
            <Typography variant="meta" color="text.secondary">
              {subtitle}
            </Typography>
          </Stack>
          {children}
        </Stack>
      </CenteredLayout>
    </IntroLook>
  );
}

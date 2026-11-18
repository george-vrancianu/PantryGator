import {
  Alert,
  Box,
  ChevronRightIcon,
  color,
  Gator,
  MicIcon,
  radius,
  ScanIcon,
  Stack,
  Typography,
  focusRingStyle,
  palette,
} from '@pocket-pantry/ui';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { IntroLook } from '@/components/IntroLook';
import { translateApiError } from '@/i18n/translateApiError';
import { useGatorAlt } from '@/lib/useGatorAlt';
import { useIntro } from '@/lib/useIntro';
import { INTRO_PATHS, type LanguagePicks } from '@/lib/intro';

type CardProps = {
  children: ReactNode;
  emphasised?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

/** A big choice card: the emphasised one has the accent border, the other the card line. */
function ChoiceCard({ children, emphasised, disabled, onClick }: CardProps) {
  return (
    <Box
      component="button"
      type="button"
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        width: '100%',
        boxSizing: 'border-box',
        p: '16px',
        textAlign: 'start',
        font: 'inherit',
        color: 'text.primary',
        backgroundColor: 'pp.cardBg',
        border: emphasised ? '2px solid' : '1px solid',
        borderColor: emphasised ? 'pp.accent' : 'pp.cardLine',
        borderRadius: radius.card,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.7 : 1,
        '&:focus-visible': focusRingStyle,
      }}
    >
      {children}
      <Box
        aria-hidden
        sx={{
          display: 'inline-flex',
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: '50%',
          backgroundColor: emphasised ? 'pp.accent' : 'pp.chip',
          color: emphasised ? color.accentInk : 'text.secondary',
        }}
      >
        <ChevronRightIcon size={18} />
      </Box>
    </Box>
  );
}

/** What the Member chose on Languages, for the note when saving them failed. */
function useLanguagePicksSummary() {
  const { t, i18n } = useTranslation(['onboarding', 'settings']);
  return (picks: LanguagePicks) => {
    const own = (locale: string) => t(`settings:languageNames.${locale}`);
    const rows: [string, string | null][] = [
      [t('onboarding:languages.app'), picks.locale],
      [t('onboarding:languages.voiceNotes.label'), picks.spokenLanguage],
      [t('onboarding:languages.receipts.label'), picks.scanLanguage],
      [t('onboarding:languages.groceryNames.label'), picks.catalogLanguage],
    ];
    const parts = rows
      .filter((row): row is [string, string] => row[1] !== null)
      .map(([name, locale]) => `${name}: ${own(locale)}`);
    return new Intl.ListFormat(i18n.language, {
      style: 'narrow',
      type: 'conjunction',
    }).format(parts);
  };
}

/**
 * Set up or skip: where a Member who is not done with the Intro lands, and where leaving Setup halfway
 * resumes. "Show me how" starts Setup at Snap.
 */
export function SetupOrSkipPage() {
  const gatorAlt = useGatorAlt();
  const { t } = useTranslation(['onboarding', 'common']);
  const navigate = useNavigate();
  const {
    resumeSetup,
    startSetup,
    finishIntro,
    finishing,
    finishError,
    unsavedLanguages,
  } = useIntro();
  const summarise = useLanguagePicksSummary();

  useEffect(() => resumeSetup(), [resumeSetup]);

  return (
    <IntroLook>
      <Stack
        component="main"
        spacing={3}
        sx={{ p: '24px', maxWidth: 420, mx: 'auto' }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            py: '16px',
            borderRadius: radius.sheet,
            backgroundColor: palette('pp-accentTint'),
          }}
        >
          <Gator
            mood="shopping-buddy"
            size={220}
            loop="signature"
            alt={gatorAlt('shopping-buddy')}
          />
        </Box>
        <Stack spacing={1}>
          <Typography variant="h1">{t('onboarding:setup.title')}</Typography>
          <Typography color="text.secondary">
            {t('onboarding:setup.body')}
          </Typography>
        </Stack>
        {unsavedLanguages ? (
          <Alert>
            {t('onboarding:setup.languagesNotSaved', {
              choices: summarise(unsavedLanguages),
            })}
          </Alert>
        ) : null}
        {finishError ? (
          <Alert>{translateApiError(t, finishError)}</Alert>
        ) : null}
        <Stack spacing={2}>
          <ChoiceCard
            emphasised
            onClick={() => {
              startSetup();
              void navigate(INTRO_PATHS.snap);
            }}
          >
            <Stack component="span" spacing={0.5}>
              <Typography
                variant="h2"
                component="span"
                sx={{ display: 'block' }}
              >
                {t('onboarding:setup.showMe')}
              </Typography>
              <Box
                component="span"
                sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <ScanIcon size={18} aria-hidden />
                <span>{t('onboarding:setup.showMeSnap')}</span>
              </Box>
              <Box
                component="span"
                sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <MicIcon size={18} aria-hidden />
                <span>{t('onboarding:setup.showMeSay')}</span>
              </Box>
            </Stack>
          </ChoiceCard>
          <ChoiceCard disabled={finishing} onClick={finishIntro}>
            <Stack component="span" spacing={0.5}>
              <Typography
                variant="h2"
                component="span"
                sx={{ display: 'block' }}
              >
                {t('onboarding:setup.skip')}
              </Typography>
              <Typography
                variant="meta"
                component="span"
                color="text.secondary"
                sx={{ display: 'block' }}
              >
                {t('onboarding:setup.skipHint')}
              </Typography>
            </Stack>
          </ChoiceCard>
        </Stack>
      </Stack>
    </IntroLook>
  );
}

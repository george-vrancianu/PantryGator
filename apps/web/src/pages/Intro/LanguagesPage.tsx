import {
  Button,
  ChoiceRadioGroup,
  type Choice,
  Link,
  Stack,
  Typography,
} from '@pocket-pantry/ui';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { BrandLockup } from '@/components/BrandLockup';
import { IntroLook } from '@/components/IntroLook';
import { changeLocale, LOCALES, type Locale } from '@/i18n/index';
import {
  initialLanguagePicks,
  nextStep,
  introPath,
  phoneLocale,
  readLanguagePicks,
  writeLanguagePicks,
  type LanguagePicks,
} from '@/lib/intro';

const SAME = 'same';
type RowKey = 'spokenLanguage' | 'scanLanguage' | 'catalogLanguage';
const ROWS: RowKey[] = ['spokenLanguage', 'scanLanguage', 'catalogLanguage'];
const ROW_COPY: Record<RowKey, string> = {
  spokenLanguage: 'voiceNotes',
  scanLanguage: 'receipts',
  catalogLanguage: 'groceryNames',
};

/**
 * Languages: the App (UI) Language, preselected from the phone, and three rows that follow it until the
 * Member picks another (Spoken, Scan and Catalog Language). The picks are kept on the device until
 * sign-up succeeds; a row left on "Same" stores nothing. Picking the App language switches the Intro
 * at once.
 */
export function LanguagesPage() {
  const { t, i18n } = useTranslation(['onboarding', 'settings']);
  const phone = phoneLocale(window.navigator.languages ?? []);
  const [picks, setPicks] = useState<LanguagePicks>(() =>
    initialLanguagePicks(readLanguagePicks(), phone),
  );

  useEffect(() => {
    writeLanguagePicks(picks);
    if (picks.locale !== i18n.resolvedLanguage) {
      void changeLocale(i18n, picks.locale);
    }
  }, [picks, i18n]);

  const ownName = (locale: Locale) => t(`settings:languageNames.${locale}`);
  const appChoices: Choice<Locale>[] = LOCALES.map((locale) => ({
    value: locale,
    label: ownName(locale),
    lang: locale,
  }));
  const rowChoices: Choice<string>[] = [
    {
      value: SAME,
      label: (
        <Trans
          t={t}
          i18nKey="onboarding:languages.same"
          values={{ language: ownName(picks.locale) }}
          components={{ language: <span lang={picks.locale} /> }}
        />
      ),
    },
    ...appChoices,
  ];

  return (
    <IntroLook>
      <Stack
        component="main"
        spacing={3}
        sx={{ p: '24px', maxWidth: 420, mx: 'auto' }}
      >
        <Link href="/">{t('onboarding:languages.back')}</Link>
        <BrandLockup entrance={false} />
        <Typography variant="h1">{t('onboarding:languages.title')}</Typography>

        <Stack spacing={0.5}>
          <ChoiceRadioGroup
            label={t('onboarding:languages.app')}
            choices={appChoices}
            value={picks.locale}
            onChange={(locale) => setPicks({ ...picks, locale })}
          />
          {phone && picks.locale === phone ? (
            <Typography variant="meta" color="text.secondary">
              {t('onboarding:languages.fromPhone')}
            </Typography>
          ) : null}
        </Stack>

        <Stack spacing={2}>
          <Typography variant="sectionLabel" color="text.secondary">
            {t('onboarding:languages.alsoUsedFor')}
          </Typography>
          {ROWS.map((row) => (
            <ChoiceRadioGroup
              key={row}
              layout="chips"
              label={t(`onboarding:languages.${ROW_COPY[row]}.label`)}
              hint={t(`onboarding:languages.${ROW_COPY[row]}.hint`)}
              choices={rowChoices}
              value={picks[row] ?? SAME}
              onChange={(value) =>
                setPicks({
                  ...picks,
                  [row]: value === SAME ? null : (value as Locale),
                })
              }
            />
          ))}
          <Typography variant="meta" color="text.secondary">
            {t('onboarding:languages.abroad')}
          </Typography>
        </Stack>

        <Button href={introPath(nextStep('languages'))}>
          {t('onboarding:languages.continue')}
        </Button>
      </Stack>
    </IntroLook>
  );
}

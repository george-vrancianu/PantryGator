import { SegmentedControl } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { changeLocale, LOCALES, type Locale } from '@/i18n/index';
import { isLocale } from '@/i18n/resources';

type Props = {
  onChange?: (locale: Locale) => void;
  /**
   * Each language in its own name (English, Română, Dansk), marked with its
   * `lang`; the default is the short codes (EN, RO, DA).
   */
  ownNames?: Record<Locale, string>;
  fullWidth?: boolean;
};

export function LanguageSwitcher({ onChange, ownNames, fullWidth }: Props) {
  const { t, i18n } = useTranslation('languageSwitcher');
  const current: Locale = isLocale(i18n.resolvedLanguage)
    ? i18n.resolvedLanguage
    : 'en';
  return (
    <SegmentedControl
      label={t('label')}
      value={current}
      fullWidth={fullWidth}
      options={LOCALES.map((locale) =>
        ownNames
          ? { value: locale, label: ownNames[locale], lang: locale }
          : { value: locale, label: t(locale) },
      )}
      onChange={(locale) => {
        void changeLocale(i18n, locale);
        onChange?.(locale);
      }}
    />
  );
}

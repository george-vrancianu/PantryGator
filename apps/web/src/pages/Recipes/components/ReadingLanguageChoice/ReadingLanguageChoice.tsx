import { ChoiceRadioGroup } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { languageName } from '@/lib/languageName';
import { useMemberPreferences } from '@/lib/settings';
import type { ReadingLanguage } from '@/lib/linkRecipe';

/**
 * Which language a Recipe read from the web comes out in: the Member's Catalog Language (the
 * default, translated if the page is in another) or the page's own. Controlled, so the link step
 * and the paste-text mode of Recipe from Link can share one value.
 */
export function ReadingLanguageChoice({
  value,
  onChange,
  input = 'link',
}: {
  value: ReadingLanguage;
  onChange: (value: ReadingLanguage) => void;
  /** What is being read; the alternative to the Catalog Language is worded for a page or for pasted text. */
  input?: 'link' | 'text';
}) {
  const { t, i18n } = useTranslation('recipes');
  const preferences = useMemberPreferences();
  // Until the Preferences arrive, the UI Language stands in: it is the Catalog Language unless the Member chose another.
  const uiLanguage = i18n.resolvedLanguage ?? 'en';
  const catalogName = languageName(
    preferences.data?.effectiveCatalogLanguage ?? uiLanguage,
    uiLanguage,
  );
  return (
    <ChoiceRadioGroup<ReadingLanguage>
      label={t('readingLanguage.label')}
      layout="rows"
      value={value}
      onChange={onChange}
      choices={[
        {
          value: 'catalog',
          label: t('readingLanguage.catalog', {
            language: catalogName,
          }),
        },
        {
          value: 'source',
          label: t(
            input === 'text'
              ? 'readingLanguage.sourceText'
              : 'readingLanguage.source',
          ),
        },
      ]}
    />
  );
}

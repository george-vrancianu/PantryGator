import {
  Alert,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isLocale, SCAN_LANGUAGES, type ScanLanguage } from '@/i18n/resources';
import { translateApiError } from '@/i18n/translateApiError';
import {
  useAddTranslation,
  useDeleteTranslation,
  useUpdateTranslation,
  type AdminTranslation,
  type EntityType,
} from '@/lib/admin';

type Props = {
  entityType: EntityType;
  entityId: string;
  /** Canonical English name; it follows the entry's own name field. */
  name: string;
  translations: AdminTranslation[];
  /** Set false for entries that only have display names (Tag Groups, Catalog Tags). */
  synonyms?: boolean;
  /**
   * `names` is just the display-name fields, for the top of a sheet; `synonyms` is everything else.
   * Mount `names` and `synonyms` as a pair to split the block around other fields.
   */
  part?: 'all' | 'names' | 'synonyms';
};

/**
 * Display names and Synonyms of one Catalog entry. English is the canonical
 * name (edited with the entry); the other catalog locales get a display name and
 * Synonyms. Every catalog locale, Danish included, takes both.
 */
export function TranslationsEditor({
  entityType,
  entityId,
  name,
  translations,
  synonyms = true,
  part = 'all',
}: Props) {
  const { t } = useTranslation(['admin', 'errors', 'common']);
  const add = useAddTranslation();
  const update = useUpdateTranslation();
  const remove = useDeleteTranslation();
  const error = add.error ?? update.error ?? remove.error;
  const title =
    synonyms && part !== 'names'
      ? t('admin:translations.title')
      : t('admin:translations.namesTitle');

  return (
    <Stack spacing={2} component="section" aria-label={title}>
      <Typography variant="sectionLabel" color="text.secondary">
        {title}
      </Typography>
      {error ? <Alert>{translateApiError(t, error)}</Alert> : null}
      {part === 'names' ? null : (
        <Typography variant="body2">
          {t('admin:translations.canonicalName', { name })}
        </Typography>
      )}
      {SCAN_LANGUAGES.filter(
        (locale) => part !== 'names' || locale !== 'en',
      ).map((locale) => (
        <LocaleBlock
          key={locale}
          locale={locale}
          entityType={entityType}
          entityId={entityId}
          translations={translations.filter((tr) => tr.locale === locale)}
          synonyms={synonyms && part !== 'names'}
          names={part !== 'synonyms'}
          add={add.mutateAsync}
          update={update.mutateAsync}
          remove={remove.mutateAsync}
        />
      ))}
    </Stack>
  );
}

type BlockProps = {
  locale: ScanLanguage;
  entityType: EntityType;
  entityId: string;
  translations: AdminTranslation[];
  synonyms: boolean;
  names: boolean;
  add: ReturnType<typeof useAddTranslation>['mutateAsync'];
  update: ReturnType<typeof useUpdateTranslation>['mutateAsync'];
  remove: ReturnType<typeof useDeleteTranslation>['mutateAsync'];
};

function LocaleBlock({
  locale,
  entityType,
  entityId,
  translations,
  synonyms: withSynonyms,
  names: withNames,
  add,
  update,
  remove,
}: BlockProps) {
  const { t } = useTranslation('admin');
  const language = t(`locales.${locale}`);
  const display = translations.find((tr) => tr.kind === 'name');
  const synonyms = translations.filter((tr) => tr.kind === 'synonym');
  const [nameValue, setNameValue] = useState(display?.value ?? '');
  const [synonym, setSynonym] = useState('');

  const saveName = () => {
    const value = nameValue.trim();
    if (display && value === '') return remove(display.id).catch(() => {});
    if (display) {
      return update({ id: display.id, value }).catch(() => {});
    }
    if (value === '') return;
    return add({ entityType, entityId, locale, kind: 'name', value }).catch(
      () => {},
    );
  };

  const addSynonym = async () => {
    const value = synonym.trim();
    if (!value) return;
    try {
      await add({ entityType, entityId, locale, kind: 'synonym', value });
      setSynonym('');
    } catch {
      // The error is shown by the parent.
    }
  };

  return (
    <Stack spacing={1} component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
      <Typography component="legend" variant="body2" sx={{ fontWeight: 700 }}>
        {language}
      </Typography>
      {withNames && isLocale(locale) && locale !== 'en' ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <TextField
            label={t('translations.displayName', { language })}
            value={nameValue}
            onChange={(event) => setNameValue(event.target.value)}
            onKeyDown={(event) => {
              // Enter saves this name, not a form this block may sit in.
              if (event.key !== 'Enter' || event.nativeEvent.isComposing)
                return;
              event.preventDefault();
              void saveName();
            }}
          />
          <Button
            variant="secondary"
            onClick={() => void saveName()}
            aria-label={t('translations.saveName', { language })}
          >
            {t('common.save')}
          </Button>
        </Stack>
      ) : null}
      {withSynonyms ? (
        <>
          <Box
            component="ul"
            aria-label={t('translations.synonyms', { language })}
            sx={{ m: 0, p: 0, listStyle: 'none' }}
          >
            {synonyms.map((item) => (
              <Stack
                component="li"
                key={item.id}
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center' }}
              >
                <Typography variant="body1" sx={{ flex: 1 }}>
                  {item.value}
                </Typography>
                <Button
                  variant="ghost"
                  aria-label={t('translations.removeSynonym', {
                    value: item.value,
                  })}
                  onClick={() => void remove(item.id).catch(() => {})}
                >
                  {t('common.remove')}
                </Button>
              </Stack>
            ))}
          </Box>
          {synonyms.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('translations.none')}
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <TextField
              label={t('translations.newSynonym', { language })}
              value={synonym}
              onChange={(event) => setSynonym(event.target.value)}
            />
            <Button
              variant="secondary"
              onClick={() => void addSynonym()}
              aria-label={t('translations.addSynonym', { language })}
            >
              {t('common.add')}
            </Button>
          </Stack>
        </>
      ) : null}
    </Stack>
  );
}

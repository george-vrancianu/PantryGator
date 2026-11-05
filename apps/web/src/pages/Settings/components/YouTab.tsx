import {
  Alert,
  Box,
  Button,
  Card,
  ChevronRightIcon,
  Link,
  LogoutIcon,
  PantryIcon,
  radius,
  Stack,
  Typography,
  useToast,
} from '@pocket-pantry/ui';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { LanguageSwitcher } from '../../../components/LanguageSwitcher';
import { LOCALES } from '../../../i18n';
import { SCAN_LANGUAGES } from '../../../i18n/resources';
import { nativeSession } from '../../../lib/nativeSession';
import { useSession, useSignOut } from '../../../lib/auth';
import {
  useMemberPreferences,
  useSaveLanguagePreference,
  useSaveLocale,
  type MemberPreferences,
} from '../../../lib/settings';
import { useLoadedUnmatchedCount } from '../hooks/useLoadedUnmatchedCount';
import { AllergiesSection } from './AllergiesSection';
import { AppearanceCard } from './AppearanceCard';
import { LanguagePreferencePicker } from './LanguagePreferencePicker';
import { SiriSection } from './SiriSection';
import {
  ScopeCaption,
  SectionHeading,
} from '../../../components/SectionHeading';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

/** The three language Preferences after the UI Language: which field each is, and the languages it offers. */
const LANGUAGE_PREFERENCES = [
  {
    field: 'catalogLanguage',
    effective: 'effectiveCatalogLanguage',
    languages: LOCALES,
  },
  {
    field: 'scanLanguage',
    effective: 'effectiveScanLanguage',
    languages: SCAN_LANGUAGES,
  },
  {
    field: 'spokenLanguage',
    effective: 'effectiveSpokenLanguage',
    languages: SCAN_LANGUAGES,
  },
] as const;

/** One language Preference: its picker, its hint naming the effective language, and its save with a toast. */
function LanguagePreferenceRow({
  preference: { field, effective, languages },
  preferences,
}: {
  preference: (typeof LANGUAGE_PREFERENCES)[number];
  preferences: MemberPreferences;
}) {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const save = useSaveLanguagePreference(field);
  return (
    <LanguagePreferencePicker
      label={t(`${field}.label`)}
      sameAsUiLabel={t(`${field}.sameAsUi`)}
      languages={languages}
      value={preferences[field]}
      hint={t(`${field}.hint`, {
        language: t(`languageNames.${preferences[effective]}`),
      })}
      onChange={(language) =>
        save.mutate(language, {
          onSuccess: () => toast.show(t(`${field}.saved`), { polite: true }),
        })
      }
      failed={save.isError}
      failedLabel={t(`${field}.saveFailed`)}
    />
  );
}

/** The You tab: the Member's own settings, each change saved as it is made. */
export function YouTab() {
  const { t, i18n } = useTranslation('settings');
  const session = useSession();
  const signOut = useSignOut();
  const saveLocale = useSaveLocale();
  const preferences = useMemberPreferences();
  const toast = useToast();
  const navigate = useNavigate();
  const id = useId();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  // Focus follows the inline confirm: to Cancel when it opens, back to "Sign out" when cancelled.
  const cancelButton = useRef<HTMLButtonElement>(null);
  const signOutButton = useRef<HTMLButtonElement>(null);
  const confirmToggled = useRef(false);
  useEffect(() => {
    if (!confirmToggled.current) return;
    if (confirmingSignOut) cancelButton.current?.focus();
    else signOutButton.current?.focus();
  }, [confirmingSignOut]);
  const toggleConfirm = (open: boolean) => {
    confirmToggled.current = true;
    setConfirmingSignOut(open);
  };
  const isAdmin = session.data?.user.role === 'admin';
  const unmatched = useLoadedUnmatchedCount(isAdmin);

  return (
    <Stack spacing={3}>
      <Typography variant="meta" color="text.secondary">
        {t('youIntro')}
      </Typography>
      <AppearanceCard />
      <Stack component="section" spacing={1} aria-labelledby={`${id}-language`}>
        <SectionHeading
          id={`${id}-language`}
          title={t('language')}
          scope={<ScopeCaption scope="you" label={t('scope.you')} />}
        />
        <Box>
          <LanguageSwitcher
            fullWidth
            ownNames={{
              en: t('languageNames.en'),
              ro: t('languageNames.ro'),
              da: t('languageNames.da'),
            }}
            onChange={(locale) =>
              saveLocale.mutate(locale, {
                onSuccess: () =>
                  toast.show(
                    i18n.getFixedT(locale, 'settings')('languageSaved'),
                    { polite: true },
                  ),
              })
            }
          />
        </Box>
        {saveLocale.isError ? <Alert>{t('localeSaveFailed')}</Alert> : null}
        {preferences.data ? (
          <>
            {LANGUAGE_PREFERENCES.map((preference) => (
              <LanguagePreferenceRow
                key={preference.field}
                preference={preference}
                preferences={preferences.data}
              />
            ))}
          </>
        ) : null}
      </Stack>
      <AllergiesSection />
      {/* Siri setup is iPhone-only; it does nothing in the Android app. */}
      {nativeSession.isAndroidApp() ? null : <SiriSection />}
      {isAdmin ? (
        <Stack component="section" spacing={1} aria-labelledby={`${id}-admin`}>
          <SectionHeading
            id={`${id}-admin`}
            title={t('admin')}
            scope={<ScopeCaption scope="admins" label={t('scope.admins')} />}
          />
          <Card sx={{ py: 1 }}>
            <Link
              href="/admin"
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: radius.control,
                  bgcolor: 'pp.accentTint',
                  color: 'pp.accentOnTint',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <PantryIcon size={20} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600 }}>
                  {t('openAdmin')}
                </Typography>
                {unmatched !== null ? (
                  <Typography variant="meta" color="text.secondary">
                    {t('unmatched', { count: unmatched })}
                  </Typography>
                ) : null}
              </Box>
              <Box
                component="span"
                aria-hidden
                sx={{ display: 'inline-flex', color: 'text.secondary' }}
              >
                <ChevronRightIcon size={18} />
              </Box>
            </Link>
          </Card>
        </Stack>
      ) : null}
      <Stack component="section" spacing={1} aria-labelledby={`${id}-account`}>
        <SectionHeading id={`${id}-account`} title={t('account')} />
        <Card>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box
              aria-hidden
              sx={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                bgcolor: 'pp.accentTint',
                color: 'pp.accentOnTint',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {session.data ? initials(session.data.user.name) : ''}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600 }}>
                {session.data?.user.name}
              </Typography>
              <Typography variant="meta" color="text.secondary">
                {session.data?.user.email}
              </Typography>
            </Box>
          </Stack>
        </Card>
        {confirmingSignOut ? (
          <Box
            role="group"
            aria-label={t('signOutConfirm')}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              p: '10px 12px',
              borderRadius: radius.control,
              bgcolor: 'pp.subtle',
            }}
          >
            <Typography variant="body2">{t('signOutConfirm')}</Typography>
            <Stack direction="row" spacing={0.5}>
              <Button
                ref={cancelButton}
                variant="ghost"
                size="sm"
                onClick={() => toggleConfirm(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={signOut.isPending}
                onClick={() =>
                  signOut.mutate(undefined, {
                    onSuccess: () => navigate('/sign-in', { replace: true }),
                  })
                }
              >
                {t('signOut')}
              </Button>
            </Stack>
          </Box>
        ) : (
          <Button
            ref={signOutButton}
            variant="secondary"
            fullWidth
            startIcon={<LogoutIcon size={18} />}
            onClick={() => toggleConfirm(true)}
          >
            {t('signOut')}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

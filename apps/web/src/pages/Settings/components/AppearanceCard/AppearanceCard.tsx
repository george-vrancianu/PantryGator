import {
  Box,
  Card,
  CheckIcon,
  Stack,
  THEME_IDS,
  Toggle,
  Typography,
  type ThemeId,
  radius,
  focusRing,
  resolveTheme,
  useToast,
  ScopeCaption,
  SectionHeading,
} from '@pocket-pantry/ui';
import { useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  onThemeSaveFailed,
  setMatchSystem,
  useSystemDark,
  useAppearance,
  useChooseTheme,
} from '@/lib/appearance';

/**
 * Settings → You → Appearance (handoff §8.3): two Theme tiles, Light and
 * Dark, and the Match system switch. Tapping a tile applies and saves that
 * Theme and turns Match system off. While Match system is on, the tile of
 * the Theme in use is the selected one.
 */
export function AppearanceCard() {
  const { t } = useTranslation('settings');
  const id = useId();
  const toast = useToast();
  const appearance = useAppearance();
  const chooseTheme = useChooseTheme();
  const systemDark = useSystemDark();

  useEffect(
    () =>
      onThemeSaveFailed(() => {
        toast.show(t('appearance.syncedOnDevice'), { polite: true });
      }),
    [toast, t],
  );

  const pick = (theme: ThemeId) => {
    if (theme !== appearance.theme || appearance.matchSystem) {
      chooseTheme(theme);
    }
    if (appearance.matchSystem) setMatchSystem(false);
  };

  // The Theme in use: with Match system on, the phone decides.
  const inUse = resolveTheme(appearance, systemDark);

  return (
    <Stack spacing={1}>
      <SectionHeading
        id={`${id}-title`}
        title={t('appearance.title')}
        scope={<ScopeCaption scope="you" label={t('scope.you')} />}
      />
      <Card>
        <Stack spacing={1.5}>
          <Box
            role="group"
            aria-labelledby={`${id}-title`}
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 1.5,
            }}
          >
            {THEME_IDS.map((theme) => {
              const selected = theme === inUse;
              return (
                <Box
                  key={theme}
                  component="button"
                  type="button"
                  aria-pressed={selected}
                  onClick={() => pick(theme)}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: 1,
                    minWidth: 0,
                    p: '7px 7px 10px',
                    borderWidth: '1.5px',
                    borderStyle: 'solid',
                    borderColor: selected ? 'pp.accent' : 'pp.lineStrong',
                    borderRadius: radius.control,
                    bgcolor: 'pp.cardBg',
                    boxShadow: selected
                      ? '0 0 0 3px color-mix(in srgb, var(--mui-palette-pp-accent) 22%, transparent)'
                      : 'none',
                    color: 'text.primary',
                    font: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                    ...focusRing,
                  }}
                >
                  <ThemePreview theme={theme} selected={selected} />
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 14,
                      fontWeight: 700,
                      lineHeight: 1.2,
                      px: 0.5,
                    }}
                  >
                    {t(`appearance.${theme}`)}
                  </Typography>
                </Box>
              );
            })}
          </Box>
          <Box sx={{ borderTop: 1, borderColor: 'pp.divider', pt: 1.5 }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography id={`${id}-match`} variant="body1">
                  {t('appearance.matchSystem')}
                </Typography>
                <Typography
                  id={`${id}-match-hint`}
                  variant="meta"
                  color="text.secondary"
                >
                  {t('appearance.matchSystemHint')}
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  <ScopeCaption scope="device" label={t('scope.device')} />
                </Box>
              </Box>
              <Toggle
                checked={appearance.matchSystem}
                onChange={setMatchSystem}
                aria-labelledby={`${id}-match`}
                aria-describedby={`${id}-match-hint`}
              />
            </Stack>
          </Box>
        </Stack>
      </Card>
    </Stack>
  );
}

/**
 * A 66 pt sketch painted in the Theme's own tokens: a green band with one
 * cream line, a sheet rising over it with an ink line and an accent bar, and
 * the check badge on the selected one.
 */
function ThemePreview({
  theme,
  selected,
}: {
  theme: ThemeId;
  selected: boolean;
}) {
  return (
    <Box
      data-theme={theme}
      aria-hidden
      sx={{
        position: 'relative',
        height: 66,
        overflow: 'hidden',
        background: 'var(--pp-canopy-bg)',
        backgroundColor: 'var(--pp-canopy-base)',
        borderRadius: radius.box,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 10,
          left: 10,
          height: 4,
          width: '44%',
          bgcolor: 'var(--pp-canopy-ink)',
          borderRadius: radius.box,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 40,
          p: 1.25,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.75,
          background: 'var(--pp-sheet-bg)',
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
        }}
      >
        <Box
          sx={{
            height: 4,
            width: '70%',
            bgcolor: 'text.primary',
            borderRadius: radius.box,
          }}
        />
        <Box
          sx={{
            height: 8,
            width: '32%',
            bgcolor: 'pp.accent',
            borderRadius: radius.box,
          }}
        />
      </Box>
      {selected ? (
        <Box
          sx={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 20,
            height: 20,
            borderRadius: radius.box,
            bgcolor: 'pp.accent',
            color: 'pp.accentInk',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CheckIcon size={14} />
        </Box>
      ) : null}
    </Box>
  );
}

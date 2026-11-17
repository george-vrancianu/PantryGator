import { Alert, SegmentedControl, Stack, Typography } from '@pocket-pantry/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

const SAME_AS_UI = 'same-as-ui';

type Props<Language extends string> = {
  /** Visible group name. */
  label: string;
  /** "Same as UI Language", the first option. */
  sameAsUiLabel: string;
  /** The choices after it, in order. */
  languages: readonly Language[];
  /** `null` is "Same as UI Language". */
  value: Language | null;
  /** The language the API works out when `value` is empty, named in the hint. */
  hint: string;
  onChange: (language: Language | null) => void;
  failed: boolean;
  failedLabel: string;
};

/** A Member language Preference: its caption, "Same as UI Language" first, then the languages, with the effective value under it. */
export function LanguagePreferencePicker<Language extends string>({
  label,
  sameAsUiLabel,
  languages,
  value,
  hint,
  onChange,
  failed,
  failedLabel,
}: Props<Language>) {
  const { t } = useTranslation('settings');
  const captionId = useId();
  return (
    <Stack spacing={0} sx={{ gap: '7px' }}>
      <Typography
        id={captionId}
        component="div"
        sx={{ fontSize: 13, fontWeight: 700, px: '2px' }}
      >
        {label}
      </Typography>
      <SegmentedControl
        labelledBy={captionId}
        fullWidth
        small
        value={value ?? SAME_AS_UI}
        options={[
          { value: SAME_AS_UI, label: sameAsUiLabel },
          ...languages.map((language) => ({
            value: language,
            label: t(`languageNames.${language}`),
            lang: language,
          })),
        ]}
        onChange={(picked) =>
          onChange(picked === SAME_AS_UI ? null : (picked as Language))
        }
      />
      <Typography
        color="text.secondary"
        sx={{ fontSize: 12.5, lineHeight: 1.35, px: '2px' }}
      >
        {hint}
      </Typography>
      {failed ? <Alert>{failedLabel}</Alert> : null}
    </Stack>
  );
}

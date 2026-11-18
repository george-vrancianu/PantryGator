import { Box, tokens } from '@pocket-pantry/ui';
import { Trans, useTranslation } from 'react-i18next';

/** A `recipes` string with the Recipe's title between `<b>` tags, set bold. */
export function BoldTitle({
  i18nKey,
  title,
}: {
  i18nKey: string;
  title: string;
}) {
  const { t } = useTranslation('recipes');
  return (
    <Trans
      t={t}
      i18nKey={i18nKey}
      values={{ title }}
      components={{
        b: <Box component="b" sx={{ color: tokens.color.ink }} />,
      }}
    />
  );
}

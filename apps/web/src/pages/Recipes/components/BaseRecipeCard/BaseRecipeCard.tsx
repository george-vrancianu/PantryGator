import { Card, Stack, Typography } from '@pocket-pantry/ui';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { BaseRecipePicker } from '../BaseRecipePicker/BaseRecipePicker';
import { BoldTitle } from '../BoldTitle/BoldTitle';

/**
 * "Base Recipe" card on Details: the closest Bases, Standalone and a search, then what Save will make.
 * `pickedTitle` is the picked base's title, null for Standalone.
 */
export function BaseRecipeCard({
  pickedTitle,
  ...picker
}: { pickedTitle: string | null } & Omit<
  ComponentProps<typeof BaseRecipePicker>,
  'subline' | 'card'
>) {
  const { t } = useTranslation('recipes');
  return (
    <Stack spacing={1}>
      <Card>
        <BaseRecipePicker
          {...picker}
          card
          subline={t('family.baseCard.subline')}
        />
      </Card>
      <Typography variant="caption" color="text.secondary" role="status">
        {pickedTitle ? (
          <BoldTitle
            i18nKey="family.baseCard.savesVariant"
            title={pickedTitle}
          />
        ) : (
          t('family.baseCard.savesBase')
        )}
      </Typography>
    </Stack>
  );
}

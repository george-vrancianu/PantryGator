import {
  PocketPantryUiProvider,
  type PocketPantryUiProviderProps,
} from '@pocket-pantry/ui';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/** The design system's provider, with the words it draws itself (a Sheet's X and Back) in the Member's language. */
export function AppUiProvider(
  props: Omit<PocketPantryUiProviderProps, 'labels'>,
) {
  const { t } = useTranslation('common');
  const labels = useMemo(
    () => ({ sheetClose: t('sheet.close'), sheetBack: t('sheet.back') }),
    [t],
  );
  return <PocketPantryUiProvider {...props} labels={labels} />;
}

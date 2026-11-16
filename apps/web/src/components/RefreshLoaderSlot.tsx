import { RefreshLoader } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { useRefreshScreen } from '../lib/refresh';

/** The layout's refresh loader, with its copy: it drops while the screen refreshes: from the top of the sheet in the shared layout (`anchor="sheet"`). */
export function RefreshLoaderSlot({
  anchor,
}: {
  anchor?: 'viewport' | 'sheet';
}) {
  const { t } = useTranslation('screenHeader');
  const { state } = useRefreshScreen();
  return (
    <RefreshLoader
      state={state}
      anchor={anchor}
      labels={{
        busy: t('refresh.busy'),
        done: t('refresh.done'),
        failed: t('refresh.failed'),
      }}
    />
  );
}

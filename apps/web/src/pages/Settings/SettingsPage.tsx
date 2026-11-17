import {
  Box,
  SegmentedTabs,
  segmentedTabId,
  segmentedTabPanelId,
} from '@pocket-pantry/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/layout/Screen';
import { FamilyTab } from './components/FamilyTab';
import { YouTab } from './components/YouTab';
import { useSettingsScreen, type SettingsTab } from './hooks/useSettingsScreen';

export function SettingsPage() {
  const { t } = useTranslation('settings');
  const id = useId();
  const { tab, selectTab } = useSettingsScreen();

  return (
    <Screen
      title={t('title')}
      back={{ label: t('screenHeader:back'), href: '/' }}
      header={
        <Box sx={{ mt: 2 }}>
          <SegmentedTabs<SettingsTab>
            onCanopy
            label={t('tabs.label')}
            id={id}
            tabs={[
              { value: 'you', label: t('tabs.you') },
              { value: 'family', label: t('tabs.family') },
            ]}
            value={tab}
            onChange={selectTab}
          />
        </Box>
      }
    >
      <Box
        role="tabpanel"
        id={segmentedTabPanelId(id, tab)}
        aria-labelledby={segmentedTabId(id, tab)}
      >
        {tab === 'you' ? <YouTab /> : <FamilyTab />}
      </Box>
    </Screen>
  );
}

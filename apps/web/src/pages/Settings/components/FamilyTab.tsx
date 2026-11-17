import { Stack, Typography } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { CreditsSection } from './CreditsSection';
import { DefaultExpirySection } from './DefaultExpirySection';
import { ExpiringSoonSection } from './ExpiringSoonSection';
import { FamilyAllergiesSection } from './FamilyAllergiesSection';
import { FamilyCatalogSection } from './FamilyCatalogSection';
import { FamilyCard } from './FamilyCard';
import { ManageTagsSection } from './ManageTagsSection';
import { MemberAllergiesSection } from './MemberAllergiesSection';

/**
 * The Family tab: the Family card, the Credits panel, then the intro, then the shared Family Settings (Expiring soon and
 * Default expiry), the Family's Allergies and the other Members', then Manage Tags and the Family catalog.
 */
export function FamilyTab() {
  const { t } = useTranslation('settings');
  return (
    <Stack spacing={2}>
      <FamilyCard />
      <CreditsSection />
      <Typography variant="meta" color="text.secondary">
        {t('familyIntro')}
      </Typography>
      <ExpiringSoonSection />
      <DefaultExpirySection />
      <FamilyAllergiesSection />
      <MemberAllergiesSection />
      <ManageTagsSection />
      <FamilyCatalogSection />
    </Stack>
  );
}

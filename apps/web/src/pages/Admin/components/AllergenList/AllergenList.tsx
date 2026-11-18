import {
  Box,
  Card,
  ChevronRightIcon,
  ListRow,
  ListRowItem,
  Tag,
  Typography,
  WarningIcon,
} from '@pocket-pantry/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { localName, type AdminAllergen } from '@/lib/admin';
import {
  CatalogCard,
  CatalogSection,
  NewButton,
  RowEditButton,
  RowTile,
} from '../CatalogRowParts/CatalogRowParts';

type Props = {
  /** In list order, retired ones included. */
  allergens: AdminAllergen[];
  onCreate: () => void;
  onEdit: (id: string) => void;
};

/** The Allergen list Members pick their Allergies from, retired entries included and marked. */
export function AllergenList({ allergens, onCreate, onEdit }: Props) {
  const { t, i18n } = useTranslation('admin');
  const headingId = useId();
  return (
    <CatalogSection
      id={headingId}
      title={t('allergen.title')}
      count={allergens.length}
      hint={t('allergen.hint')}
    >
      {allergens.length === 0 ? (
        <Card sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {t('allergen.empty')}
          </Typography>
        </Card>
      ) : (
        <CatalogCard labelledBy={headingId}>
          {allergens.map((allergen) => {
            const name = localName(allergen, i18n.language);
            return (
              <ListRowItem key={allergen.id}>
                <ListRow
                  leading={
                    <RowTile>
                      <WarningIcon size={19} />
                    </RowTile>
                  }
                  title={
                    <RowEditButton
                      label={t('allergen.edit', { name })}
                      onClick={() => onEdit(allergen.id)}
                    >
                      {name}
                    </RowEditButton>
                  }
                  tags={
                    allergen.archived ? (
                      <Tag tone="neutral">{t('allergen.retiredBadge')}</Tag>
                    ) : null
                  }
                  trailing={
                    <Box sx={{ pr: 1.5, display: 'flex' }}>
                      <ChevronRightIcon size={18} />
                    </Box>
                  }
                />
              </ListRowItem>
            );
          })}
        </CatalogCard>
      )}
      <Box sx={{ justifySelf: 'start' }}>
        <NewButton onClick={onCreate}>{t('allergen.new')}</NewButton>
      </Box>
    </CatalogSection>
  );
}

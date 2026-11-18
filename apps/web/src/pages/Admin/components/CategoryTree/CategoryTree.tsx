import { Box, ChevronRightIcon, ListRow, ListRowItem } from '@pocket-pantry/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { IngredientIconSlot } from '@/components/IngredientIconSlot';
import {
  localName,
  type AdminCatalog,
  type AdminLeafCategory,
  type AdminParentCategory,
  type CategoryKind,
} from '@/lib/admin';
import {
  CatalogCard,
  CatalogSection,
  NewButton,
  RowEditButton,
} from '../CatalogRowParts/CatalogRowParts';

type Props = {
  catalog: AdminCatalog;
  onCreate: (kind: CategoryKind) => void;
  onEdit: (kind: CategoryKind, id: string) => void;
};

const chevron = (
  <Box sx={{ pr: 1.5, display: 'flex' }}>
    <ChevronRightIcon size={18} />
  </Box>
);

/** Parent Categories, each always followed by its Leaf Categories as inset rows. */
export function CategoryTree({ catalog, onCreate, onEdit }: Props) {
  const { t, i18n } = useTranslation('admin');
  const headingId = useId();

  const leafMeta = (
    leaf: AdminLeafCategory,
    parent: AdminParentCategory,
  ): string => {
    const days = leaf.defaultExpiryDays;
    const location = leaf.defaultLocation;
    if (days === null && location === null) {
      return t('category.usesDefaults', {
        parent: localName(parent, i18n.language),
      });
    }
    return [
      days === null ? null : t('category.expiresIn', { days }),
      location === null ? null : t(`common:locations.${location}`),
    ]
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <CatalogSection
      id={headingId}
      title={t('index.categories')}
      count={catalog.parentCategories.length}
    >
      <CatalogCard labelledBy={headingId}>
        {catalog.parentCategories.map((parent) => {
          const leaves = catalog.leafCategories.filter(
            (leaf) => leaf.parentId === parent.id,
          );
          const parentName = localName(parent, i18n.language);
          const aisle = catalog.aisles.find((a) => a.id === parent.aisleId);
          return (
            <ListRowItem key={parent.id}>
              {/* Contains the row's stretched edit button, so it does not cover the leaves below. */}
              <Box sx={{ position: 'relative' }}>
                <ListRow
                  leading={<IngredientIconSlot aisleId={parent.aisleId} />}
                  title={
                    <RowEditButton
                      label={t('category.editParent', { name: parentName })}
                      onClick={() => onEdit('parent', parent.id)}
                    >
                      {parentName}
                    </RowEditButton>
                  }
                  meta={[
                    aisle ? localName(aisle, i18n.language) : null,
                    t('category.leafCount', { count: leaves.length }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={chevron}
                />
              </Box>
              {leaves.length > 0 ? (
                <Box
                  component="ul"
                  aria-label={parentName}
                  sx={{
                    m: 0,
                    p: 0,
                    pl: 6,
                    listStyle: 'none',
                    borderTop: 1,
                    borderColor: 'divider',
                  }}
                >
                  {leaves.map((leaf) => {
                    const leafName = localName(leaf, i18n.language);
                    return (
                      <ListRowItem key={leaf.id}>
                        <ListRow
                          title={
                            <RowEditButton
                              label={t('category.editLeaf', { name: leafName })}
                              onClick={() => onEdit('leaf', leaf.id)}
                            >
                              {leafName}
                            </RowEditButton>
                          }
                          meta={leafMeta(leaf, parent)}
                          trailing={chevron}
                        />
                      </ListRowItem>
                    );
                  })}
                </Box>
              ) : null}
            </ListRowItem>
          );
        })}
      </CatalogCard>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <NewButton onClick={() => onCreate('parent')}>
          {t('category.newParent')}
        </NewButton>
        <NewButton onClick={() => onCreate('leaf')}>
          {t('category.newLeaf')}
        </NewButton>
      </Box>
    </CatalogSection>
  );
}

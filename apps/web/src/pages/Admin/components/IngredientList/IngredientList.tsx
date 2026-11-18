import {
  AlertIcon,
  Box,
  Card,
  ChevronRightIcon,
  ListRow,
  ListRowItem,
  SearchIcon,
  Tag,
  TextField,
  Typography,
  tokens,
} from '@pocket-pantry/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { IngredientIconSlot } from '@/components/IngredientIconSlot';
import {
  localName,
  type AdminCatalog,
  type AdminIngredient,
} from '@/lib/admin';
import {
  CatalogCard,
  CatalogSection,
  NewButton,
  RowEditButton,
} from '../CatalogRowParts/CatalogRowParts';

type Props = {
  /** The Ingredients to show, already filtered. */
  ingredients: AdminIngredient[];
  /** The loaded Catalog: names for each row's Leaf Category, Aisle and first Allergen. */
  catalog: AdminCatalog;
  filter: string;
  onFilterChange: (filter: string) => void;
  onCreate: () => void;
  onEdit: (id: string) => void;
};

export function IngredientList({
  ingredients,
  catalog,
  filter,
  onFilterChange,
  onCreate,
  onEdit,
}: Props) {
  const { t, i18n } = useTranslation('admin');
  const headingId = useId();

  const rowParts = (item: AdminIngredient) => {
    const leaf = catalog.leafCategories.find(
      (candidate) => candidate.id === item.leafCategoryId,
    );
    const parent = catalog.parentCategories.find(
      (candidate) => candidate.id === leaf?.parentId,
    );
    const aisle = catalog.aisles.find(
      (candidate) => candidate.id === parent?.aisleId,
    );
    const allergen = item.allergenIds
      .map((id) => catalog.allergens.find((candidate) => candidate.id === id))
      .find((candidate) => candidate !== undefined);
    return {
      aisleId: aisle?.id,
      meta: [
        leaf ? localName(leaf, i18n.language) : null,
        aisle ? localName(aisle, i18n.language) : null,
      ]
        .filter(Boolean)
        .join(' · '),
      allergen: allergen ? localName(allergen, i18n.language) : null,
    };
  };

  return (
    <CatalogSection
      id={headingId}
      title={t('index.ingredients')}
      count={catalog.ingredients.length}
    >
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField
          hiddenLabel
          placeholder={t('ingredient.filter')}
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
          slotProps={{
            htmlInput: { 'aria-label': t('ingredient.filter') },
            input: {
              startAdornment: (
                <Box
                  aria-hidden
                  sx={{
                    display: 'flex',
                    mr: 1,
                    color: tokens.color.muted,
                  }}
                >
                  <SearchIcon size={18} />
                </Box>
              ),
              sx: { height: 42 },
            },
          }}
        />
        <Box sx={{ flexShrink: 0 }}>
          <NewButton onClick={onCreate}>{t('ingredient.new')}</NewButton>
        </Box>
      </Box>
      {ingredients.length === 0 ? (
        <Card sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {t('ingredient.empty')}
          </Typography>
        </Card>
      ) : (
        <CatalogCard labelledBy={headingId}>
          {ingredients.map((item) => {
            const name = localName(item, i18n.language);
            const { aisleId, meta, allergen } = rowParts(item);
            return (
              <ListRowItem key={item.id}>
                <ListRow
                  leading={
                    <IngredientIconSlot
                      ingredientId={item.id}
                      aisleId={aisleId}
                    />
                  }
                  title={
                    <RowEditButton
                      label={t('ingredient.edit', { name })}
                      onClick={() => onEdit(item.id)}
                    >
                      {name}
                    </RowEditButton>
                  }
                  meta={meta}
                  tags={
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {item.allergensReviewPending ? (
                        <Tag tone="soon" icon={<AlertIcon size={12} />}>
                          {t('ingredient.unchecked')}
                        </Tag>
                      ) : allergen ? (
                        <Tag tone="neutral">{allergen}</Tag>
                      ) : null}
                      <Tag tone="neutral">{item.defaultUnit}</Tag>
                    </Box>
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
    </CatalogSection>
  );
}

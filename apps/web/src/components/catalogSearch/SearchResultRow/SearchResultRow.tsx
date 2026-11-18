import { Box, tokens, radius } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import type { CatalogSearchResult } from '@/lib/catalog';
import { IngredientIconSlot } from '@/components/IngredientIconSlot';
import { FamilyTag } from '../FamilyTag/FamilyTag';
import { RowTag } from '../RowTag/RowTag';
import { OptionRow } from '../OptionRow/OptionRow';
import { Highlighted } from '../matchRange';

export type SearchResultRowProps = {
  id: string;
  result: CatalogSearchResult;
  /** What the Member typed, for the highlight. */
  query: string;
  /** Show the default unit chip. */
  showUnit: boolean;
  /** Keyboard-highlighted. */
  active: boolean;
  /** Faded while newer results load. */
  dimmed: boolean;
  first: boolean;
  /** The host's pill for this row, if any. */
  tag?: string | null;
  onSelect: () => void;
};

/** The "{Leaf Category} · {Aisle}" line under a result's name. */
export const resultMeta = (result: CatalogSearchResult) =>
  `${result.leafCategory.name} · ${result.parentCategory.aisle.name}`;

/** One option of the result listbox: icon in its Aisle tint, highlighted name, meta, unit chip or ↵ hint. */
export function SearchResultRow({
  id,
  result,
  query,
  showUnit,
  active,
  dimmed,
  first,
  tag = null,
  onSelect,
}: SearchResultRowProps) {
  const { color } = tokens;
  const { t } = useTranslation('catalog');
  const meta = resultMeta(result);
  return (
    <OptionRow
      id={id}
      active={active}
      first={first}
      dimmed={dimmed}
      label={[
        result.name,
        result.owner === 'family' ? t('search.familyTag') : null,
        meta,
        showUnit ? result.defaultUnit : null,
        tag,
      ]
        .filter(Boolean)
        .join(', ')}
      onSelect={onSelect}
    >
      <IngredientIconSlot
        ingredientId={result.id}
        aisleId={result.parentCategory.aisle.id}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          sx={{
            fontSize: 15,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <Highlighted text={result.name} query={query} />
          {result.owner === 'family' ? <FamilyTag /> : null}
        </Box>
        <Box sx={{ fontSize: 13, fontWeight: 500, color: color.muted }}>
          {meta}
        </Box>
      </Box>
      {tag ? <RowTag>{tag}</RowTag> : null}
      {showUnit ? (
        active ? (
          <Box
            component="span"
            aria-hidden="true"
            sx={{
              flexShrink: 0,
              px: '6px',
              py: '2px',
              border: `1px solid ${color.line}`,
              borderRadius: radius.box,
              color: color.muted,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            ↵
          </Box>
        ) : (
          <Box
            component="span"
            sx={{
              flexShrink: 0,
              px: '8px',
              py: '5px',
              borderRadius: radius.tag,
              backgroundColor: color.chipNeutral,
              color: color.muted,
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            {result.defaultUnit}
          </Box>
        )
      ) : null}
    </OptionRow>
  );
}

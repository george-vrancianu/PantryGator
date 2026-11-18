import { Box, CanopySearchField } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
};

/** The Pantry's search field, in the Canopy header, 16 under the title row. */
export function PantrySearch({ query, onQueryChange }: Props) {
  const { t } = useTranslation('pantry');
  return (
    <Box sx={{ mt: 2 }}>
      <CanopySearchField
        label={t('search.label')}
        placeholder={t('search.placeholder')}
        value={query}
        onChange={onQueryChange}
      />
    </Box>
  );
}

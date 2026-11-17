import { Box, LocationChip } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { FILTERS, type PantryFilter } from '../../../lib/pantry';

type Props = {
  filter: PantryFilter;
  onFilterChange: (filter: PantryFilter) => void;
  counts: Record<PantryFilter, number>;
};

/** The All / Fridge / Freezer / Cupboard / Spices chips with live counts, in one scrolling row that fades out at the right edge. */
export function LocationChips({ filter, onFilterChange, counts }: Props) {
  const { t } = useTranslation('pantry');
  return (
    <Box
      role="group"
      aria-label={t('filters')}
      sx={{
        display: 'flex',
        gap: '6px',
        height: 44,
        // The chips sit 44 high; the row gives back the slack so the gap to the first group stays the drawn 12.
        my: '-4px',
        mr: -2,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        maskImage: 'linear-gradient(90deg, #000 84%, transparent 100%)',
      }}
    >
      {FILTERS.map((chip) => (
        <LocationChip
          key={chip}
          selected={chip === filter}
          onClick={() => onFilterChange(chip)}
          label={chip === 'all' ? t('all') : t(`common:locations.${chip}`)}
          count={counts[chip]}
        />
      ))}
    </Box>
  );
}

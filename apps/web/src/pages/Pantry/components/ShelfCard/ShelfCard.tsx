import {
  Box,
  color,
  focusRing,
  PlusIcon,
  radius,
  Typography,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { LocationIcon } from '@/components/pantry/LocationIcon/LocationIcon';
import type { StorageLocation } from '@/lib/catalog';

type Props = {
  location: StorageLocation;
  /** The "+": the Add to Pantry sheet with this Location preset. */
  onAdd: (location: StorageLocation) => void;
};

/** An empty Location's shelf: what usually lives there, and a "+" that adds to it. */
export function ShelfCard({ location, onAdd }: Props) {
  const { t } = useTranslation(['pantry', 'common']);
  const name = t(`common:locations.${location}`);
  return (
    <Box
      data-testid={`shelf-${location}`}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        p: '12px 12px 12px 14px',
        borderRadius: radius.card,
        border: `1.5px dashed ${color.lineStrong}`,
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          flex: 'none',
          display: 'grid',
          placeItems: 'center',
          width: 44,
          height: 44,
          borderRadius: '50%',
          backgroundColor: 'pp.subtle',
          color: 'text.secondary',
        }}
      >
        <LocationIcon location={location} size={24} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
          {t(`pantry:empty.shelf.${location}`)}
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
          {t(`pantry:empty.hint.${location}`)}
        </Typography>
      </Box>
      <Box
        component="button"
        type="button"
        aria-label={t('pantry:empty.addTo', { location: name })}
        onClick={() => onAdd(location)}
        sx={{
          flex: 'none',
          display: 'grid',
          placeItems: 'center',
          width: 38,
          height: 38,
          p: 0,
          borderRadius: '50%',
          border: '1.5px solid',
          borderColor: 'pp.accent',
          backgroundColor: color.cardBg,
          color: 'pp.accent',
          cursor: 'pointer',
          ...focusRing,
        }}
      >
        <PlusIcon size={20} />
      </Box>
    </Box>
  );
}

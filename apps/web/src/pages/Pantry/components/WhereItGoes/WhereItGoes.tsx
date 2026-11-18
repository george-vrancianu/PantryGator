import {
  Box,
  color,
  focusRing,
  radius,
  shadow,
  visuallyHidden,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { LocationIcon } from '@/components/pantry/LocationIcon/LocationIcon';
import { LOCATIONS, type StorageLocation } from '@/lib/catalog';

type Props = {
  /** The group's accessible name. */
  label: string;
  value: StorageLocation;
  onChange: (location: StorageLocation) => void;
  /** The Catalog default Location, marked with a dot; null for none (no mark). */
  usual: StorageLocation | null;
};

/** The four Locations as a toggle group: the Catalog default carries a dot that reads "usual". */
export function WhereItGoes({ label, value, onChange, usual }: Props) {
  const { t } = useTranslation();
  return (
    <Box
      role="group"
      aria-label={label}
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: '4px',
        p: '4px',
        backgroundColor: 'pp.chip',
        borderRadius: radius.control,
      }}
    >
      {LOCATIONS.map((location) => {
        const pressed = location === value;
        return (
          <Box
            key={location}
            component="button"
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(location)}
            sx={{
              position: 'relative',
              minHeight: 52,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              border: 'none',
              font: 'inherit',
              fontSize: 12,
              fontWeight: pressed ? 700 : 600,
              color: 'text.primary',
              backgroundColor: pressed ? color.cardBg : 'transparent',
              boxShadow: pressed ? shadow.segment : 'none',
              borderRadius: radius.control,
              cursor: 'pointer',
              ...focusRing,
            }}
          >
            <LocationIcon location={location} size={20} />
            {t(`common:locations.${location}`)}
            {location === usual ? (
              <>
                <Box
                  aria-hidden="true"
                  sx={{
                    position: 'absolute',
                    top: 6,
                    right: 8,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: 'pp.accent',
                  }}
                />
                <Box component="span" sx={visuallyHidden}>
                  {` ${t('pantry:form.usualDot')}`}
                </Box>
              </>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}

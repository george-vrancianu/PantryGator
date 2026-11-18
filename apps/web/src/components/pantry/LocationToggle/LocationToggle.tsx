import { Box, SegmentedControl, Typography } from '@pocket-pantry/ui';
import { type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { LOCATIONS, type StorageLocation } from '@/lib/catalog';
import { LocationIcon } from '../LocationIcon/LocationIcon';

type Props = {
  /** The visible caption above the toggle, also the group's accessible name (set as an aria-label, so a CSS-uppercased caption cannot change its case). */
  label: string;
  /** The pressed Location; null when none is chosen yet. */
  value: StorageLocation | null;
  onChange: (location: StorageLocation) => void;
  /** The caption's look, to match the labels of the fields around it. */
  captionSx?: ComponentProps<typeof Typography>['sx'];
  /** Marks the toggle as the Voice review's focus target for this action. */
  voicePicker?: string;
};

/**
 * The four Locations as one full-width row of toggle buttons, an icon above
 * each full label. On a narrow phone the dense toggle shrinks the labels
 * (down to 11 px) so even the Romanian ones fit whole.
 */
export function LocationToggle({
  label,
  value,
  onChange,
  captionSx,
  voicePicker,
}: Props) {
  const { t } = useTranslation('common');
  return (
    <Box data-voice-picker={voicePicker}>
      <Typography
        component="div"
        sx={[
          { fontSize: 12, fontWeight: 600, color: 'text.secondary', mb: '4px' },
          ...(Array.isArray(captionSx) ? captionSx : [captionSx]),
        ]}
      >
        {label}
      </Typography>
      <SegmentedControl
        label={label}
        dense
        value={value}
        onChange={onChange}
        options={LOCATIONS.map((location) => ({
          value: location,
          label: t(`locations.${location}`),
          icon: <LocationIcon location={location} size={18} />,
        }))}
      />
    </Box>
  );
}

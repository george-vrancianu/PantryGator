import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from '@mui/material';
import { useState } from 'react';
import { SegmentedControl } from './SegmentedControl';
import {
  CupboardIcon,
  FreezerIcon,
  FridgeIcon,
  SpicesIcon,
} from '../atoms/icons';

const meta: Meta<typeof SegmentedControl> = {
  title: 'Molecules/SegmentedControl',
  component: SegmentedControl,
};
export default meta;

function Segments() {
  const [value, setValue] = useState<'ingredients' | 'templates'>(
    'ingredients',
  );
  return (
    <Box sx={{ p: 3 }}>
      <SegmentedControl
        label="Add from"
        options={[
          { value: 'ingredients', label: 'Ingredients' },
          { value: 'templates', label: 'Templates' },
        ]}
        value={value}
        onChange={setValue}
      />
    </Box>
  );
}

export const Interactive: StoryObj<typeof SegmentedControl> = {
  render: () => <Segments />,
};

function SmallSegments() {
  const [value, setValue] = useState<'same' | 'en' | 'ro'>('same');
  return (
    <Box sx={{ p: 3 }}>
      <SegmentedControl
        small
        fullWidth
        label="Catalog Language"
        options={[
          { value: 'same', label: 'Same as UI' },
          { value: 'en', label: 'English' },
          { value: 'ro', label: 'Română' },
        ]}
        value={value}
        onChange={setValue}
      />
    </Box>
  );
}

/** The small variant: 12.5 px labels (Settings: Catalog Language, Scan Language). */
export const Small: StoryObj<typeof SegmentedControl> = {
  render: () => <SmallSegments />,
};

type Location = 'fridge' | 'freezer' | 'cupboard' | 'spices';
type Lang = 'en' | 'ro' | 'da';

const CAPTIONS: Record<Lang, string> = {
  en: 'Location',
  ro: 'Locație',
  da: 'Placering',
};

const ICONS = {
  fridge: <FridgeIcon size={18} />,
  freezer: <FreezerIcon size={18} />,
  cupboard: <CupboardIcon size={18} />,
  spices: <SpicesIcon size={18} />,
};

const LABELS: Record<Lang, Record<Location, string>> = {
  en: {
    fridge: 'Fridge',
    freezer: 'Freezer',
    cupboard: 'Cupboard',
    spices: 'Spices',
  },
  ro: {
    fridge: 'Frigider',
    freezer: 'Congelator',
    cupboard: 'Dulap',
    spices: 'Condimente',
  },
  da: {
    fridge: 'Køleskab',
    freezer: 'Fryser',
    cupboard: 'Skab',
    spices: 'Krydderier',
  },
};

function DenseSegments({ lang, width = 256 }: { lang: Lang; width?: number }) {
  const [value, setValue] = useState<Location>('fridge');
  const labels = LABELS[lang];
  return (
    // The narrowest form on a 320 px phone: the phone Review panel, about 256 px.
    <Box sx={{ width }} lang={lang}>
      <SegmentedControl
        label={CAPTIONS[lang]}
        options={(Object.keys(labels) as Location[]).map((location) => ({
          value: location,
          label: labels[location],
          icon: ICONS[location],
        }))}
        value={value}
        onChange={setValue}
        dense
      />
    </Box>
  );
}

/** `dense` with icons: the four Locations at the narrowest width a 320 px phone gives them. */
export const Dense: StoryObj<typeof SegmentedControl> = {
  render: () => <DenseSegments lang="en" />,
};

/** The longest labels, Romanian: shrunk towards 11 px to fit whole, never shortened. */
export const DenseRomanian: StoryObj<typeof SegmentedControl> = {
  render: () => <DenseSegments lang="ro" />,
};

/** Romanian in the Voice review at 320 px: the toggle pulled out of the 57 px indent leaves about 262 px. */
export const DenseRomanianVoice: StoryObj<typeof SegmentedControl> = {
  render: () => <DenseSegments lang="ro" width={262} />,
};

/** Danish, whose "Krydderier" and "Køleskab" are the next longest. */
export const DenseDanish: StoryObj<typeof SegmentedControl> = {
  render: () => <DenseSegments lang="da" />,
};

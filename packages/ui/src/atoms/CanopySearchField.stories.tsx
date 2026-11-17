import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from '@mui/material';
import { useState } from 'react';
import { CanopySearchField } from './CanopySearchField';
import { canopy } from '../theme/themeVars';

const meta: Meta<typeof CanopySearchField> = {
  title: 'Atoms/CanopySearchField',
  component: CanopySearchField,
};
export default meta;

function Field({
  initial,
  placeholder,
}: {
  initial: string;
  placeholder: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <CanopySearchField
      label="Search Pantry"
      placeholder={placeholder}
      value={value}
      onChange={setValue}
    />
  );
}

/** Empty, with a value and with a placeholder too long for the field, on the Canopy. */
export const States: StoryObj<typeof CanopySearchField> = {
  render: () => (
    <Box
      sx={{
        p: 3,
        display: 'grid',
        gap: 2,
        background: canopy.bg,
        maxWidth: 360,
      }}
    >
      <Field initial="" placeholder="Search by name" />
      <Field initial="Milk" placeholder="Search by name" />
      <Field
        initial=""
        placeholder="Search everything in the Pantry by name, brand or Location"
      />
    </Box>
  ),
};

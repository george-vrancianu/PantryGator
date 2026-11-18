import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Box } from '../atoms/Layout';
import { ChoiceRadioGroup, type Choice } from './ChoiceRadioGroup';

const meta: Meta<typeof ChoiceRadioGroup> = {
  title: 'Molecules/ChoiceRadioGroup',
  component: ChoiceRadioGroup,
};
export default meta;

const languages: Choice<string>[] = [
  { value: 'en', label: 'English' },
  { value: 'ro', label: 'Română', lang: 'ro' },
  { value: 'de', label: 'Deutsch', lang: 'de' },
];

function Group({
  choices,
  ...rest
}: Partial<React.ComponentProps<typeof ChoiceRadioGroup<string>>> & {
  choices: Choice<string>[];
}) {
  const [value, setValue] = useState(choices[0]?.value ?? '');
  return (
    <Box sx={{ p: 3, maxWidth: 360 }}>
      <ChoiceRadioGroup
        label="Language"
        {...rest}
        choices={choices}
        value={value}
        onChange={setValue}
      />
    </Box>
  );
}

export const Default: StoryObj<typeof ChoiceRadioGroup> = {
  render: () => <Group choices={languages} hint="Pick the one you speak." />,
};

export const Chips: StoryObj<typeof ChoiceRadioGroup> = {
  render: () => <Group choices={languages} layout="chips" />,
};

export const OliveTone: StoryObj<typeof ChoiceRadioGroup> = {
  render: () => (
    <Box sx={{ backgroundColor: 'pp.accent', p: 2 }}>
      <Group choices={languages} tone="olive" />
    </Box>
  ),
};

export const Disabled: StoryObj<typeof ChoiceRadioGroup> = {
  render: () => (
    <Group choices={languages} hint="Locked while saving." disabled />
  ),
};

export const LongText: StoryObj<typeof ChoiceRadioGroup> = {
  render: () => (
    <Group
      hint="A longer hint that wraps onto a second line to show how the group lays out its description."
      choices={[
        {
          value: 'a',
          label:
            'A label long enough that it has to wrap onto several lines inside the row',
          description:
            'And a description that is just as long, to check the check mark stays pinned to the right and the text never runs under it.',
        },
        { value: 'b', label: 'Short', description: 'Short description' },
      ]}
    />
  ),
};

export const Empty: StoryObj<typeof ChoiceRadioGroup> = {
  render: () => <Group choices={[]} hint="No choices to show." />,
};

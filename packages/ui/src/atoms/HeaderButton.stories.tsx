import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from './Layout';
import { HeaderButton } from './HeaderButton';
import { CameraIcon, SettingsIcon } from './icons';
import { canopy } from '../theme/themeVars';

const meta: Meta<typeof HeaderButton> = {
  title: 'Atoms/HeaderButton',
  component: HeaderButton,
  args: { children: 'Settings' },
  decorators: [
    (Story) => (
      <Box
        sx={{
          p: 3,
          background: canopy.bg,
          backgroundColor: canopy.base,
          color: canopy.ink,
        }}
      >
        <Story />
      </Box>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof HeaderButton>;

/** The labelled secondary action on the Canopy. */
export const Chip: Story = {
  args: { icon: <SettingsIcon size={18} /> },
};

/** The gold primary action: an editor's Save. */
export const Key: Story = {
  args: { tone: 'key', children: 'Save' },
};

export const WithIcon: Story = {
  args: { icon: <CameraIcon size={18} />, children: 'Camera' },
};

export const Disabled: Story = {
  args: { tone: 'key', children: 'Save', disabled: true },
};

/** A long label stays on one line. */
export const LongLabel: Story = {
  args: { children: 'Back to your Recipes, three added' },
};

/** With `href` it renders a link. */
export const AsLink: Story = {
  args: { href: '#', children: 'Import' },
};

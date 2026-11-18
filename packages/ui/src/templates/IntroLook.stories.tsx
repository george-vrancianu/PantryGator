import type { Meta, StoryObj } from '@storybook/react-vite';
import { IntroLook } from './IntroLook';

const meta: Meta<typeof IntroLook> = {
  title: 'Templates/IntroLook',
  component: IntroLook,
  parameters: { layout: 'fullscreen' },
  args: { children: <p style={{ margin: 16 }}>Welcome to the Intro.</p> },
};
export default meta;
type Story = StoryObj<typeof IntroLook>;

/** Light whatever Theme the toolbar says. */
export const Cream: Story = {};
export const Olive: Story = { args: { ground: 'olive' } };
export const Canopy: Story = { args: { ground: 'canopy' } };

export const LongContent: Story = {
  args: {
    children: (
      <p style={{ margin: 16 }}>
        {Array.from({ length: 40 }, () => 'A long welcome line.').join(' ')}
      </p>
    ),
  },
};

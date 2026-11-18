import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScopeCaption, SectionHeading } from './SectionHeading';

const meta: Meta<typeof SectionHeading> = {
  title: 'Molecules/SectionHeading',
  component: SectionHeading,
  args: { id: 'appearance', title: 'Appearance' },
};
export default meta;
type Story = StoryObj<typeof SectionHeading>;

export const Plain: Story = {};

export const ThisPhone: Story = {
  args: { scope: <ScopeCaption scope="device" label="This phone" /> },
};
export const OnlyYou: Story = {
  args: { scope: <ScopeCaption scope="you" label="Only you" /> },
};
export const Admins: Story = {
  args: { scope: <ScopeCaption scope="admins" label="Admins" /> },
};

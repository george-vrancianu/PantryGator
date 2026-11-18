import type { Meta, StoryObj } from '@storybook/react-vite';
import { RowControls } from './RowControls';

const noop = () => undefined;

const meta: Meta<typeof RowControls> = {
  title: 'Molecules/RowControls',
  component: RowControls,
  args: {
    moveUp: 'Move up',
    moveDown: 'Move down',
    remove: 'Remove',
    first: false,
    last: false,
    onMoveUp: noop,
    onMoveDown: noop,
    onRemove: noop,
  },
};
export default meta;
type Story = StoryObj<typeof RowControls>;

export const Middle: Story = {};
export const First: Story = { args: { first: true } };
export const Last: Story = { args: { last: true } };
export const NoRemove: Story = { args: { remove: undefined } };
export const Disabled: Story = { args: { disabled: true } };

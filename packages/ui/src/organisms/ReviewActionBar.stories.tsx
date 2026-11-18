import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReviewActionBar } from './ReviewActionBar';

const noop = () => undefined;

const meta: Meta<typeof ReviewActionBar> = {
  title: 'Organisms/ReviewActionBar',
  component: ReviewActionBar,
  parameters: { layout: 'fullscreen' },
  args: {
    saveLabel: 'Save 3 items',
    discardLabel: 'Discard',
    canSave: true,
    onSave: noop,
    onDiscard: noop,
  },
};
export default meta;
type Story = StoryObj<typeof ReviewActionBar>;

export const Default: Story = {};
export const CannotSave: Story = { args: { canSave: false } };
export const Retake: Story = { args: { discardLabel: 'Retake' } };
export const LongLabels: Story = {
  args: {
    saveLabel: 'Save 128 items to the Pantry and the Shopping List',
    discardLabel: 'Discard everything and go back to the start',
  },
};

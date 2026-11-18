import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConfirmAction, ConfirmPrompt } from './ConfirmAction';

const noop = () => undefined;
const confirmLabels = { confirm: 'Confirm', cancel: 'Cancel' };

const meta: Meta<typeof ConfirmAction> = {
  title: 'Molecules/ConfirmAction',
  component: ConfirmAction,
  args: {
    label: 'Remove',
    message: 'Remove this for good?',
    confirmLabels,
    onConfirm: noop,
  },
};
export default meta;
type Story = StoryObj<typeof ConfirmAction>;

/** Click the trigger: focus moves to Confirm, and Cancel returns it to the trigger. */
export const Trigger: Story = {};
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Disabled: Story = { args: { disabled: true } };

/** The step on its own, for an action started from a menu. */
export const Prompt: StoryObj<typeof ConfirmPrompt> = {
  render: () => (
    <ConfirmPrompt
      message="Remove this for good?"
      labels={confirmLabels}
      onConfirm={noop}
      onCancel={noop}
    />
  ),
};

export const LongText: Story = {
  args: {
    label: 'Remove this ingredient from every recipe that uses it',
    message:
      'A long line that keeps going well past one row so it has to wrap on a narrow phone and must still read cleanly.',
  },
};

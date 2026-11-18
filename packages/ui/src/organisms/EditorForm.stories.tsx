import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextField } from '../atoms/TextField';
import { EditorForm, type EditorFormLabels } from './EditorForm';
import { EditorSheetContext } from './editorSheetContext';

const noop = () => undefined;

const labels: EditorFormLabels = {
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  delete: 'Delete',
  deleteConfirm: 'Delete this for good?',
  confirmLabels: { confirm: 'Confirm', cancel: 'Keep' },
};

const meta: Meta<typeof EditorForm> = {
  title: 'Organisms/EditorForm',
  component: EditorForm,
  parameters: { layout: 'fullscreen' },
  args: {
    heading: 'Edit aisle',
    labels,
    canSave: true,
    saving: false,
    onSubmit: noop,
    onCancel: noop,
    children: <TextField label="Name" defaultValue="Produce" />,
  },
};
export default meta;
type Story = StoryObj<typeof EditorForm>;

/** An editor page: the form draws its own heading and Save / Cancel. */
export const Page: Story = {};
export const PageWithDelete: Story = { args: { onDelete: noop } };
export const WithError: Story = {
  args: { errorMessage: 'That name is already taken.' },
};
export const Saving: Story = { args: { saving: true } };

/** Opened as a sheet: the heading is the title, Save is pinned and Delete is the danger link. */
export const InSheet: Story = {
  args: { onDelete: noop },
  decorators: [
    (Story) => (
      <EditorSheetContext.Provider value={{ onClose: noop }}>
        <Story />
      </EditorSheetContext.Provider>
    ),
  ],
};
export const CannotSave: Story = { args: { canSave: false } };
export const Deleting: Story = {
  args: { onDelete: noop, deleting: true },
};
export const LongText: Story = {
  args: {
    heading:
      'A long line that keeps going well past one row so it has to wrap on a narrow phone and must still read cleanly.',
    description:
      'A long line that keeps going well past one row so it has to wrap on a narrow phone and must still read cleanly.',
    errorMessage:
      'A long line that keeps going well past one row so it has to wrap on a narrow phone and must still read cleanly.',
  },
};

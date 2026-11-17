import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps } from 'react';
import { Button } from '../atoms/Button';
import { Box } from '../atoms/Layout';
import { Sheet } from './Sheet';

/**
 * Every story renders the Sheet already open. Switch the Theme in the toolbar to see both
 * Themes. The roles follow ADR 0043: X at the right of the title row, a pinned footer with the
 * secondary on the left and the primary on the right, a danger link at the bottom of the content.
 */
const meta: Meta<typeof Sheet> = {
  title: 'Molecules/Sheet',
  component: Sheet,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof Sheet>;

const noop = () => undefined;

function Body({ lines = 3 }: { lines?: number }) {
  return (
    <Box sx={{ p: '16px', display: 'grid', gap: '12px' }}>
      {Array.from({ length: lines }, (_, i) => (
        <Box key={i}>Some content for the sheet, line {i + 1}.</Box>
      ))}
    </Box>
  );
}

/** Reopens on demand, so the Member can close it with the X and try again. */
function Demo(props: Omit<ComponentProps<typeof Sheet>, 'open' | 'onClose'>) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Box sx={{ p: 2 }}>
        <Button onClick={() => setOpen(true)}>Open sheet</Button>
      </Box>
      <Sheet
        {...(props as ComponentProps<typeof Sheet>)}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const render = (
  args: Omit<ComponentProps<typeof Sheet>, 'open' | 'onClose'>,
) => <Demo {...args} />;

export const PrimaryOnly: Story = {
  render: () =>
    render({
      title: 'Add to Pantry',
      size: 'content',
      primary: { label: 'Add to Pantry', onClick: noop },
      children: <Body />,
    }),
};

export const PrimaryAndSecondary: Story = {
  render: () =>
    render({
      title: 'Expiry',
      size: 'content',
      primary: { label: 'Done', onClick: noop },
      secondary: { label: 'No expiry', onClick: noop },
      children: <Body />,
    }),
};

export const PrimaryAndDestructive: Story = {
  render: () =>
    render({
      title: 'Edit Batch',
      primary: { label: 'Save', onClick: noop },
      destructive: { label: 'Remove from Pantry', onClick: noop },
      children: <Body />,
    }),
};

export const DangerPrimary: Story = {
  render: () =>
    render({
      title: 'Revoke Promo Code',
      size: 'content',
      primary: { label: 'Revoke', onClick: noop, tone: 'danger' },
      secondary: { label: 'Keep it', onClick: noop },
      children: <Body lines={1} />,
    }),
};

export const Pending: Story = {
  render: () =>
    render({
      title: 'Edit Batch',
      size: 'content',
      primary: { label: 'Save', onClick: noop, pending: true },
      secondary: { label: 'Clear', onClick: noop },
      children: <Body />,
    }),
};

/** Voice Review: the Member must answer, so there is no X. */
export const NotDismissable: Story = {
  render: () =>
    render({
      title: 'Review',
      dismissable: false,
      size: 'content',
      primary: { label: 'Add 3', onClick: noop },
      secondary: { label: 'Discard', onClick: noop },
      children: <Body />,
    }),
};

export const NoActions: Story = {
  render: () =>
    render({ title: 'Pick a location', size: 'content', children: <Body /> }),
};

export const BackAndSubtitle: Story = {
  render: () =>
    render({
      title: 'Milk',
      subtitle: 'Dairy, 2 Batches',
      onBack: noop,
      primary: { label: 'Done', onClick: noop },
      children: <Body />,
    }),
};

export const LongText: Story = {
  render: () =>
    render({
      title:
        'A very long sheet title that has to wrap onto a second line without pushing the X away',
      subtitle:
        'And an equally long subtitle, with a Supercalifragilisticexpialidocious-length word',
      onBack: noop,
      primary: {
        label:
          'A primary label that is far too long for its half of the footer',
        onClick: noop,
      },
      secondary: {
        label: 'An equally long secondary',
        onClick: noop,
      },
      destructive: {
        label: 'A destructive link with a long label as well',
        onClick: noop,
      },
      children: <Body lines={30} />,
    }),
};

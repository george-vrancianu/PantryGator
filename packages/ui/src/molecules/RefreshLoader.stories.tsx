import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { RefreshLoader, type RefreshLoaderProps } from './RefreshLoader';

const labels = {
  busy: 'Refreshing…',
  done: 'Updated just now',
  failed: "Couldn't refresh · showing what you had",
};

const meta: Meta<typeof RefreshLoader> = {
  title: 'Molecules/RefreshLoader',
  component: RefreshLoader,
  args: { labels },
};
export default meta;

type Story = StoryObj<typeof RefreshLoader>;

/** Down at the top of the canvas with the arc spinning; switch the Theme in the toolbar. */
export const Busy: Story = { args: { state: 'busy' } };

/** The warning mark and a shake, then it tucks away after about a second. */
export const Failed: Story = { args: { state: 'failed' } };

/** Anchored to the sheet rather than the viewport: it drops from the top of the clipped, positioned box it sits in. */
export const SheetAnchor: Story = {
  args: { state: 'busy', anchor: 'sheet' },
  render: (args) => (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        height: 240,
        border: '1px dashed currentColor',
      }}
    >
      <RefreshLoader {...args} />
    </div>
  ),
};

function Cycle() {
  const [state, setState] = useState<RefreshLoaderProps['state']>('idle');
  return (
    <div style={{ paddingTop: 80, display: 'flex', gap: 8 }}>
      {(['idle', 'busy', 'done', 'failed'] as const).map((s) => (
        <button key={s} type="button" onClick={() => setState(s)}>
          {s}
        </button>
      ))}
      <RefreshLoader state={state} labels={labels} />
    </div>
  );
}

/** Drive the states by hand to see the drop and the tuck. */
export const Playground: Story = { render: () => <Cycle /> };

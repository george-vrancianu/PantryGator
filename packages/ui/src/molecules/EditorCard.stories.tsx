import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from '../atoms/Layout';
import { StepNumber } from '../atoms/StepNumber';
import { AddRow, EditorCard } from './EditorCard';

const meta: Meta<typeof EditorCard> = {
  title: 'Molecules/EditorCard',
  component: EditorCard,
};
export default meta;

function Row({ number, text }: { number: number; text: string }) {
  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
        p: '12px 14px',
      }}
    >
      <StepNumber>{number}</StepNumber>
      <Box sx={{ minWidth: 0 }}>{text}</Box>
    </Box>
  );
}

/** One card: an add row, the list, and an add row, divided by hairlines. */
export const Default: StoryObj<typeof EditorCard> = {
  render: () => (
    <Box sx={{ p: 3, maxWidth: 400 }}>
      <EditorCard>
        <AddRow label="Add a step at the start" onClick={() => {}} />
        <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none' }}>
          <Row number={1} text="Chop the onions." />
          <Row number={2} text="Fry them in butter until golden." />
        </Box>
        <AddRow label="Add a step" onClick={() => {}} />
      </EditorCard>
    </Box>
  ),
};

/** Nothing to list yet: only the add row. */
export const Empty: StoryObj<typeof EditorCard> = {
  render: () => (
    <Box sx={{ p: 3, maxWidth: 400 }}>
      <EditorCard>
        <AddRow label="Add the first step" onClick={() => {}} />
      </EditorCard>
    </Box>
  ),
};

export const LongText: StoryObj<typeof EditorCard> = {
  render: () => (
    <Box sx={{ p: 3, maxWidth: 320 }}>
      <EditorCard>
        <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none' }}>
          <Row
            number={1}
            text="A step long enough that it wraps over several lines inside the card without pushing it wider than its column."
          />
        </Box>
        <AddRow
          label="An add label that is also quite long and has to wrap"
          onClick={() => {}}
        />
      </EditorCard>
    </Box>
  ),
};

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Box } from '../atoms/Layout';
import { palette, radius } from '../theme/themeVars';
import { ListRow } from './ListRow';
import { SwipeRow, type SwipeRowLabels } from './SwipeRow';

const meta: Meta = { title: 'Molecules/SwipeRow' };
export default meta;

const labelsFor = (name: string): SwipeRowLabels => ({
  question: `Remove ${name}?`,
  context: 'from your list',
  keep: 'Keep',
  remove: 'Remove',
  releaseToDelete: 'Release to delete',
});

const NAMES = [
  'Tomato',
  'Milk',
  'Flour',
  'A very long ingredient name '.repeat(3),
];

function List({
  withTap,
  withHold,
}: {
  withTap?: boolean;
  withHold?: boolean;
}) {
  const [names, setNames] = useState(NAMES);
  const [edited, setEdited] = useState<string | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  return (
    <Box
      component="ul"
      sx={{
        m: 2,
        p: 0,
        listStyle: 'none',
        bgcolor: palette('background-paper'),
        borderRadius: radius.card,
        overflow: 'hidden',
      }}
    >
      {names.map((name) => (
        <SwipeRow
          key={name}
          name={name}
          labels={{
            ...labelsFor(name),
            hint: withHold ? 'Swipe left to remove, hold to edit' : undefined,
          }}
          onEdit={withHold ? () => setEdited(name) : undefined}
          pressed={withTap ? ticked.includes(name) : undefined}
          onTap={
            withTap
              ? () =>
                  setTicked((current) =>
                    current.includes(name)
                      ? current.filter((n) => n !== name)
                      : [...current, name],
                  )
              : undefined
          }
          onRemove={() =>
            setNames((current) => current.filter((n) => n !== name))
          }
        >
          <ListRow title={name} meta="2 pcs" done={ticked.includes(name)} />
        </SwipeRow>
      ))}
      {edited ? <li aria-live="polite">Editing {edited}</li> : null}
    </Box>
  );
}

/** Swipe left: short springs back, the tab in view asks, past two thirds removes. Delete/Backspace asks from the keyboard. */
export const Default: StoryObj = { render: () => <List /> };

/** Tapping (or Space) ticks the row. */
export const Tappable: StoryObj = { render: () => <List withTap /> };

/** Press and hold for half a second: the circle grows from the touch point, then the row opens its editor (here, a line under the list). Enter does the same. */
export const Holdable: StoryObj = { render: () => <List withHold /> };

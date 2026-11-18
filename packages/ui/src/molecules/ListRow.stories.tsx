import type { Meta, StoryObj } from '@storybook/react-vite';
import { IconButton } from '../atoms/IconButton';
import { CheckIcon, CloseIcon } from '../atoms/icons';
import { Box } from '../atoms/Layout';
import { palette, radius } from '../theme/themeVars';
import { ListRow, ListRowItem } from './ListRow';

const meta = {
  title: 'Molecules/ListRow',
  component: ListRow,
  decorators: [
    (Story, { name }) => (
      <Box
        component="ul"
        sx={{ m: 0, p: 0, maxWidth: 360, bgcolor: 'background.paper' }}
      >
        {/* Divided renders its own items. */}
        {name === 'Divided' ? (
          <Story />
        ) : (
          <ListRowItem>
            <Story />
          </ListRowItem>
        )}
      </Box>
    ),
  ],
  args: { title: 'Whole milk' },
} satisfies Meta<typeof ListRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const tick = (
  <Box
    aria-hidden="true"
    sx={{
      width: 24,
      height: 24,
      borderRadius: radius.box,
      border: `2px solid ${palette('pp-box')}`,
    }}
  />
);
const tag = (
  <Box
    component="span"
    sx={{
      fontSize: 11,
      fontWeight: 700,
      color: 'primary.main',
      bgcolor: 'primary.light',
      px: 1,
      py: 0.5,
      borderRadius: radius.tag,
    }}
  >
    Unmatched
  </Box>
);
const remove = (
  <IconButton label="Remove">
    <CloseIcon size={18} />
  </IconButton>
);

export const TitleOnly: Story = {};
export const WithLeading: Story = { args: { leading: tick } };
export const WithMeta: Story = { args: { meta: '2 l' } };
export const WithTags: Story = { args: { tags: tag } };
export const WithTrailing: Story = { args: { trailing: remove } };
export const WithBelow: Story = {
  args: { below: <Box sx={{ pt: 1 }}>Fields go here</Box> },
};
export const AllSlots: Story = {
  args: { leading: tick, meta: '2 l', tags: tag, trailing: remove },
};
export const LongTitle: Story = {
  args: {
    ...AllSlots.args,
    title:
      'Extra-virgin cold-pressed organic olive oil from the sunny hills of Tuscany',
  },
};
export const CheckedStruckThrough: Story = {
  args: {
    leading: (
      <Box
        aria-hidden="true"
        sx={{
          width: 24,
          height: 24,
          borderRadius: radius.box,
          bgcolor: 'primary.main',
          color: palette('background-paper'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CheckIcon size={16} strokeWidth={2.6} />
      </Box>
    ),
    meta: '2 l',
    done: true,
    trailing: remove,
  },
};
export const Divided: Story = {
  render: (args) => (
    <>
      <ListRowItem>
        <ListRow {...args} leading={tick} />
      </ListRowItem>
      <ListRowItem>
        <ListRow {...args} title="Eggs" meta="12" />
      </ListRowItem>
    </>
  ),
};

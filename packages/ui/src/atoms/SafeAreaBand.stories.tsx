import type { Meta, StoryObj } from '@storybook/react-vite';
import { SafeAreaBand } from './SafeAreaBand';
import { palette } from '../theme/themeVars';

const meta = {
  title: 'Atoms/SafeAreaBand',
  component: SafeAreaBand,
} satisfies Meta<typeof SafeAreaBand>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Zero height here: a browser reports no top inset; on a phone with an island it fills the status bar. */
export const PageBackground: Story = {};
/** The Intro's olive ground, as IntroLook passes it. */
export const OliveGround: Story = { args: { color: palette('pp-accent') } };

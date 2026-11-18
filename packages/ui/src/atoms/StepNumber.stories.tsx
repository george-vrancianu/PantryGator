import type { Meta, StoryObj } from '@storybook/react-vite';
import { StepNumber } from './StepNumber';

const meta: Meta<typeof StepNumber> = {
  title: 'Atoms/StepNumber',
  component: StepNumber,
  args: { children: '1' },
};
export default meta;

export const Filled: StoryObj<typeof StepNumber> = {};

/** The "add a step" row of the Steps editor. */
export const Dashed: StoryObj<typeof StepNumber> = {
  args: { dashed: true, children: '+' },
};

export const MultiDigit: StoryObj<typeof StepNumber> = {
  args: { children: '128' },
};

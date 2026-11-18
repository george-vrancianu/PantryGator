import type { Meta, StoryObj } from '@storybook/react-vite';
import { BrandLockup } from './BrandLockup';

const meta: Meta<typeof BrandLockup> = {
  title: 'Molecules/BrandLockup',
  component: BrandLockup,
  args: { name: 'Pocket Pantry' },
};
export default meta;

export const HopsIn: StoryObj<typeof BrandLockup> = {};

/** The inline header of the Languages screen. */
export const Still: StoryObj<typeof BrandLockup> = {
  args: { entrance: false },
};

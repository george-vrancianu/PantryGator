import type { SxProps, Theme } from '@mui/material/styles';
export { default as Box } from '@mui/material/Box';
export type { BoxProps } from '@mui/material/Box';
export { default as Stack } from '@mui/material/Stack';
export type { StackProps } from '@mui/material/Stack';

// The `sx` prop type, so app code can type a style prop without importing MUI.
export type Sx = SxProps<Theme>;

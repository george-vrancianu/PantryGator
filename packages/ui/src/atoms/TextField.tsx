import MuiTextField, {
  type TextFieldProps as MuiTextFieldProps,
} from '@mui/material/TextField';

export type TextFieldProps = Omit<MuiTextFieldProps, 'variant'> & {
  /**
   * `editor` is the 44 pt field of the Recipe editors and their sheets (the default is 50).
   * A multiline field keeps its own height.
   */
  density?: 'default' | 'editor';
};

const editorSx = {
  '& .MuiOutlinedInput-root': { minHeight: 44 },
  '& .MuiOutlinedInput-root:not(.MuiInputBase-multiline) input': {
    py: '10px',
  },
};

/**
 * Outlined, full-width text input with a visible label.
 *
 * A native select always shows its chosen option, even an empty-valued
 * "None", so its label floats above the field from the start rather than
 * sitting on top of that option.
 */
export function TextField({
  density = 'default',
  sx,
  ...props
}: TextFieldProps) {
  const { select, slotProps } = props;
  const native =
    select &&
    typeof slotProps?.select === 'object' &&
    slotProps.select.native === true;
  const inputLabel = slotProps?.inputLabel;
  const merged =
    native && typeof inputLabel !== 'function'
      ? { ...slotProps, inputLabel: { shrink: true, ...inputLabel } }
      : slotProps;
  return (
    <MuiTextField
      variant="outlined"
      fullWidth
      {...props}
      sx={
        density === 'editor'
          ? [editorSx, ...(Array.isArray(sx) ? sx : [sx])]
          : sx
      }
      slotProps={merged}
    />
  );
}

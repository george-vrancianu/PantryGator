import MuiCheckbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import type { Theme } from '@mui/material/styles';
import { useId, type ChangeEvent } from 'react';
import { focusRingStyle } from '../theme/focusRing';
import { CheckIcon } from './icons';
import { control, radius, shadow, themePalette } from '../theme/themeVars';

export type CheckboxProps = {
  label: string;
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Explains the choice; read out with the label. */
  helperText?: string;
  disabled?: boolean;
};

/**
 * Handoff section 5: a 22 box inside a 44pt target, radius `r-box`. Empty is a 1.5 px `box` border on
 * `box-bg` with an inset `shadow-box`; ticked is the `btn-bg` gradient with a `primary.contrastText` check (as the primary Button's ink).
 * The root is the 44pt target (its negative margin keeps the box where a 22 one sat); the box is the icon.
 */
const boxSx = (theme: Theme) => {
  const { pp, primary } = themePalette(theme);
  return {
    width: 44,
    height: 44,
    p: 0,
    m: '-11px',
    flex: '0 0 auto',
    color: primary.contrastText,
    '& .pp-box': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 22,
      height: 22,
      boxSizing: 'border-box',
      borderRadius: radius.box,
      border: '1.5px solid',
      borderColor: pp.box,
      backgroundColor: control.boxBg,
      boxShadow: shadow.box,
    },
    '&.Mui-checked .pp-box': {
      borderColor: 'transparent',
      backgroundImage: control.btnBg,
      boxShadow: 'none',
    },
    '&.Mui-checked': { color: primary.contrastText },
    '&.Mui-disabled': { opacity: 0.45, color: primary.contrastText },
    // The ring hugs the visible 22 box, not the 44 target around it.
    '&.Mui-focusVisible .pp-box, &:has(:focus-visible) .pp-box': focusRingStyle,
  };
};

/** A labelled checkbox with optional helper text underneath. */
export function Checkbox({
  label,
  checked,
  onChange,
  helperText,
  disabled,
}: CheckboxProps) {
  const helperId = useId();
  return (
    <FormControl>
      <FormControlLabel
        label={label}
        sx={{ ml: 0, gap: '10px' }}
        control={
          <MuiCheckbox
            checked={checked}
            disabled={disabled}
            onChange={onChange}
            disableRipple
            icon={<span className="pp-box" />}
            checkedIcon={
              <span className="pp-box">
                <CheckIcon size={14} strokeWidth={2.8} />
              </span>
            }
            sx={boxSx}
            slotProps={{
              input: { 'aria-describedby': helperText ? helperId : undefined },
            }}
          />
        }
      />
      {helperText ? (
        <FormHelperText id={helperId}>{helperText}</FormHelperText>
      ) : null}
    </FormControl>
  );
}

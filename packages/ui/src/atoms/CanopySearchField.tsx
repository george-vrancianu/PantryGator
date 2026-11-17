import Box from '@mui/material/Box';
import { SearchIcon } from './icons';
import { canopyFocusRingStyle } from '../theme/focusRing';
import { bodyFont, canopy, radius } from '../theme/themeVars';

export type CanopySearchFieldProps = {
  /** Accessible name of the field. */
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  /** The longest text the field accepts. */
  maxLength?: number;
};

/** The search field on the Canopy header (Canopy handoff section 4.3): 46 high, recessed, search icon 18, 15px text. */
export function CanopySearchField({
  label,
  placeholder,
  value,
  onChange,
  maxLength,
}: CanopySearchFieldProps) {
  return (
    <Box
      component="label"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        height: 46,
        boxSizing: 'border-box',
        px: '14px',
        borderRadius: radius.btn,
        backgroundColor: canopy.field,
        border: `1px solid ${canopy.fieldLine}`,
        boxShadow: canopy.fieldShadow,
        color: canopy.muted,
        '&:focus-within': canopyFocusRingStyle,
      }}
    >
      <SearchIcon size={18} />
      <Box
        component="input"
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        maxLength={maxLength}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
          onChange(event.target.value)
        }
        sx={{
          flex: 1,
          minWidth: 0,
          border: 0,
          outline: 0,
          p: 0,
          background: 'transparent',
          fontFamily: bodyFont,
          fontSize: 15,
          lineHeight: 1,
          color: canopy.ink,
          '&::placeholder': { color: canopy.muted, opacity: 1 },
          '&::-webkit-search-cancel-button': { display: 'none' },
        }}
      />
    </Box>
  );
}

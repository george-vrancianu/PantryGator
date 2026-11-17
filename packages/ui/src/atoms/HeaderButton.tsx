import ButtonBase from '@mui/material/ButtonBase';
import type { MouseEventHandler, ReactNode, Ref } from 'react';
import { canopyChipStyle, canopyKeyStyle } from '../theme/canopyStyles';
import { canopyFocusRing } from '../theme/focusRing';
import { radius } from '../theme/themeVars';

export type HeaderButtonProps = {
  /** The visible label, which is also the accessible name. */
  children: ReactNode;
  /** An 18px icon before the label. */
  icon?: ReactNode;
  /** `chip` is the Canopy's labelled secondary action; `key` is the gold primary action (Save). */
  tone?: 'chip' | 'key';
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  disabled?: boolean;
  ref?: Ref<HTMLButtonElement>;
  /** For a label that says more than the visible text (it must still contain it). */
  'aria-label'?: string;
  'aria-haspopup'?: 'menu';
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
};

/** The Canopy header's labelled button (Canopy handoff section 4.1): 44 high, radius 8, icon 18 and a 13.5/700 label. A link when `href` is set. */
export function HeaderButton({
  children,
  icon,
  tone = 'chip',
  href,
  onClick,
  disabled,
  ref,
  ...aria
}: HeaderButtonProps) {
  const key = tone === 'key';
  return (
    <ButtonBase
      {...aria}
      ref={ref}
      {...(href ? { href } : {})}
      disabled={disabled}
      onClick={onClick}
      sx={{
        height: 44,
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '7px',
        p: '0 12px 0 11px',
        flexShrink: 0,
        borderRadius: radius.btn,
        fontFamily: 'inherit',
        fontSize: 13.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        textDecoration: 'none',
        ...(key ? canopyKeyStyle : canopyChipStyle),
        '&:hover': { filter: 'brightness(1.08)' },
        '&.Mui-disabled': { opacity: 0.5 },
        '& svg': { width: 18, height: 18 },
        ...canopyFocusRing,
      }}
    >
      {icon ? (
        <span aria-hidden style={{ display: 'flex' }}>
          {icon}
        </span>
      ) : null}
      {children}
    </ButtonBase>
  );
}

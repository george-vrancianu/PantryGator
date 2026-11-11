import { Box, tokens, visuallyHidden } from '@pocket-pantry/ui';
import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { CameraMode } from '../../lib/cameraMode';
import { glassFocusRing } from './glass';
import {
  ModeLabel,
  VERTICAL_KEYS,
  useFocusFollowsMode,
  useModeKeys,
} from './ModeSlider';

type Props<Mode extends CameraMode> = {
  modes: readonly Mode[];
  mode: Mode;
  disabled: boolean;
  keysDisabled: boolean;
  onChange: (mode: Mode) => void;
};

const reducedMotion = '@media (prefers-reduced-motion: reduce)';

/**
 * The mode slider as a vertical list for the rail: every mode shown, the selected one in the accent
 * colour, scrolling when the rail is short. The same radio group as the strip (so it is announced
 * the same), the same arrow keys (up and down too), and a tap changes mode. No drag: the list
 * scrolls instead.
 */
export function ModeList<Mode extends CameraMode>({
  modes,
  mode,
  disabled,
  keysDisabled,
  onChange,
}: Props<Mode>) {
  const { t } = useTranslation('scan');
  const group = useRef<HTMLDivElement>(null);
  useModeKeys({ modes, mode, keysDisabled, onChange, keys: VERTICAL_KEYS });
  useFocusFollowsMode(group, mode);
  // Keep the chosen mode in view when the list scrolls (on open, and when the arrows move it).
  useLayoutEffect(() => {
    group.current
      ?.querySelector('[aria-checked="true"]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [mode]);
  if (modes.length < 2) return null;
  return (
    <Box
      data-testid="mode-list"
      sx={{ minHeight: 0, overflowY: 'auto', width: '100%' }}
    >
      <Box role="status" sx={visuallyHidden}>
        {t('slider.announce', { mode: t(`mode.${mode}`) })}
      </Box>
      <Box
        ref={group}
        role="radiogroup"
        aria-label={t('modes')}
        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
      >
        {modes.map((item) => {
          const active = item === mode;
          return (
            <Box
              key={item}
              component="button"
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(item)}
              sx={{
                flex: 'none',
                minHeight: 40,
                p: '8px 4px',
                border: 0,
                background: 'transparent',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                userSelect: 'none',
                color: active ? tokens.color.accent : tokens.color.muted,
                transition: 'color 200ms',
                '&:disabled': { cursor: 'default' },
                '&:focus-visible': glassFocusRing,
                [reducedMotion]: { transition: 'none' },
              }}
            >
              <ModeLabel mode={item} active={active} />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

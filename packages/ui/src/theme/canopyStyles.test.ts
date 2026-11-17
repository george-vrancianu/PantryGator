import { describe, expect, it } from 'vitest';
import { canopyChipStyle, canopyKeyStyle } from './canopyStyles';
import { canopyFocusRing, canopyFocusRingStyle } from './focusRing';
import { canopy } from './themeVars';

describe('Canopy shared styles', () => {
  it('the focus ring is gold, 2px, offset 2', () => {
    expect(canopyFocusRingStyle).toEqual({
      outline: `2px solid ${canopy.gold}`,
      outlineOffset: '2px',
    });
    expect(canopyFocusRing['&.Mui-focusVisible, &:focus-visible']).toBe(
      canopyFocusRingStyle,
    );
  });

  it('the chip and key recipes use the Canopy tokens', () => {
    expect(canopyChipStyle.boxShadow).toBe('var(--pp-shadow-canopy-chip)');
    expect(canopyChipStyle.backgroundColor).toBe(canopy.chip);
    expect(canopyKeyStyle.background).toBe(canopy.keyBg);
    expect(canopyKeyStyle.boxShadow).toBe(canopy.keyShadow);
  });
});

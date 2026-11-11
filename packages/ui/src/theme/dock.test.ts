import { describe, expect, it } from 'vitest';
import { aboveDock, DOCK_BOTTOM_CSS } from './dock';

describe('aboveDock', () => {
  it('is measured from the Dock own bottom, so bars stay lined up with it', () => {
    expect(DOCK_BOTTOM_CSS).toBe('max(28px, env(safe-area-inset-bottom, 0px))');
    expect(aboveDock(76)).toContain(DOCK_BOTTOM_CSS);
  });
});

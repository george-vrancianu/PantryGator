import { describe, expect, it } from 'vitest';
import {
  onListTone,
  pantryBasicTone,
  pantryLineTone,
  slotStatusTone,
} from './statusTone';

describe('statusTone', () => {
  it('maps each forecast status to its tone', () => {
    expect(slotStatusTone).toEqual({
      covered: 'accent',
      onList: 'soon',
      short: 'urgent',
      unavailable: 'neutral',
    });
  });

  it('shows "on list" in the soon tone everywhere', () => {
    expect(onListTone).toBe('soon');
  });

  it('maps a Pantry line status and a Basic', () => {
    expect(pantryLineTone).toEqual({
      covered: 'accent',
      short: 'soon',
      missing: 'urgent',
    });
    expect(pantryBasicTone).toBe('ok');
  });
});

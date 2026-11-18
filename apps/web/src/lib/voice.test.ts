import { describe, expect, it } from 'vitest';
import { formatClock } from './voice';

describe('formatClock', () => {
  it('floors to whole seconds, so the Listening card and the Gator bubble agree', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(2999)).toBe('0:02');
    expect(formatClock(3000)).toBe('0:03');
    expect(formatClock(59_999)).toBe('0:59');
    expect(formatClock(60_000)).toBe('1:00');
    expect(formatClock(69_400)).toBe('1:09');
  });
});

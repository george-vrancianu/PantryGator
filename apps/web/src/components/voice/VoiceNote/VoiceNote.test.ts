import { describe, expect, it } from 'vitest';
import { defaultTargetFor } from './VoiceNote';

describe('defaultTargetFor', () => {
  it.each([
    ['/shopping', 'shopping'],
    ['/shopping/', 'shopping'],
    ['/pantry', 'pantry'],
    ['/shopping/staples', 'none'],
    ['/pantry/x', 'none'],
    ['/', 'none'],
    ['/recipes', 'none'],
  ])('%s gives %s', (pathname, list) => {
    expect(defaultTargetFor(pathname)).toBe(list);
  });
});

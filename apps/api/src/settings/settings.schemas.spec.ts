import {
  THEME_IDS,
  normalizeTheme,
  updatePreferencesBody,
} from './settings.schemas';

describe('Theme ids', () => {
  it('are Light and Dark', () => {
    expect([...THEME_IDS]).toEqual(['light', 'dark']);
  });

  describe('read', () => {
    it.each([
      ['warm', 'light'],
      ['minimal', 'light'],
      ['light', 'light'],
      ['dark', 'dark'],
    ])('%s is %s', (stored, expected) => {
      expect(normalizeTheme(stored)).toBe(expected);
    });

    it.each(['sage', '', null, undefined, 3])('%s is not a Theme', (stored) => {
      expect(normalizeTheme(stored)).toBeNull();
    });
  });

  describe('write', () => {
    const parse = (theme: unknown) =>
      updatePreferencesBody.safeParse({ theme });

    it.each([
      ['warm', 'light'],
      ['minimal', 'light'],
      ['light', 'light'],
      ['dark', 'dark'],
    ])('a sent %s is saved as %s', (sent, saved) => {
      const result = parse(sent);
      expect(result.success && result.data.theme).toBe(saved);
    });

    it.each(['neon', null])('rejects %s', (sent) => {
      expect(parse(sent).success).toBe(false);
    });
  });
});

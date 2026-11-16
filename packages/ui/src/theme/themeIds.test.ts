import { describe, expect, it } from 'vitest';
import {
  THEME_IDS as API_THEME_IDS,
  normalizeTheme,
} from '../../../../apps/api/src/settings/settings.schemas';
import { THEME_IDS, migrateTheme } from './themes';

describe('Theme ids', () => {
  // The API keeps its own copy to validate a saved Theme; the two must not drift.
  it('match the ids the API accepts as a Member Preference', () => {
    expect([...API_THEME_IDS]).toEqual([...THEME_IDS]);
  });

  it('map the same way in the API and in the ui', () => {
    for (const value of ['warm', 'minimal', 'light', 'dark', 'x']) {
      expect(normalizeTheme(value)).toBe(migrateTheme(value));
    }
  });
});

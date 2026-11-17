import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderWithTheme } from '../test/render';
import { writeAppearance } from './appearance';
import { THEMES } from './themes';
import { useForcedThemeColor } from './useForcedThemeColor';

function Forced() {
  useForcedThemeColor('dark');
  return null;
}

const metas = () =>
  Array.from(
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
  );

describe('useForcedThemeColor', () => {
  beforeEach(() => {
    for (const media of ['(prefers-color-scheme: light)', '']) {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      if (media) meta.media = media;
      document.head.append(meta);
    }
  });
  afterEach(() => {
    localStorage.clear();
    cleanup();
    for (const meta of metas()) meta.remove();
  });

  it("paints the browser chrome in the forced Theme's bg while mounted, then restores the root Theme's", () => {
    writeAppearance({ theme: 'light', matchSystem: false });
    const { rerender } = renderWithTheme(<Forced />);
    expect(metas().map((m) => m.content)).toEqual([
      THEMES.dark.bg,
      THEMES.dark.bg,
    ]);

    rerender(<></>);
    // The root Theme comes back.
    expect(metas().map((m) => m.content)).toEqual([
      THEMES.light.bg,
      THEMES.light.bg,
    ]);
  });
});

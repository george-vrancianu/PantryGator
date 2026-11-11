import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { authoredCss } from '../../test/stickyHeader';
import { VOICE_PILL_ATTRIBUTE } from '../../lib/voiceFocus';
import { BackgroundStrip } from './BackgroundStrip';

describe('BackgroundStrip', () => {
  it('keeps its 16px margins at least as wide as the left and right insets', () => {
    renderWithProviders(
      <BackgroundStrip
        items={[
          {
            id: 'a',
            status: 'reading',
            title: 'Soup',
            detail: 'Reading',
          } as never,
        ]}
        openSheet={() => {}}
      />,
    );
    const strip = document.querySelector<HTMLElement>(
      `[${VOICE_PILL_ATTRIBUTE}]`,
    )!;
    const css = authoredCss(strip);
    expect(css).toContain('left:max(16px, env(safe-area-inset-left');
    expect(css).toContain('right:max(16px, env(safe-area-inset-right');
  });
});

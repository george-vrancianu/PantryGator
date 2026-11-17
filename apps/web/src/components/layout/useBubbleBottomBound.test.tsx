import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewBar } from '../PreviewBar';
import { ReviewActionBar } from '../ReviewActionBar';
import { BUBBLE_BOTTOM_VAR } from '../background/bubble/GatorBubble';
import { renderWithProviders } from '../../test/render';

const read = () =>
  document.documentElement.style.getPropertyValue(BUBBLE_BOTTOM_VAR);

afterEach(() => vi.restoreAllMocks());

function barHeight(px: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    height: px,
  } as DOMRect);
}

describe('bubble bottom bound', () => {
  it('Scan Review action bar raises the bubble above itself while mounted', () => {
    barHeight(88);
    const view = renderWithProviders(
      <ReviewActionBar
        saveLabel="Save"
        canSave
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(read()).toBe('88px');
    view.unmount();
    expect(read()).toBe('');
  });

  it('Catalog Recipe preview bar raises the bubble above itself while mounted', () => {
    barHeight(112);
    const view = renderWithProviders(
      <PreviewBar
        recipeId="r1"
        title="Soup"
        state={{ status: 'none' }}
        onAdd={vi.fn()}
      />,
    );
    expect(read()).toBe('112px');
    view.unmount();
    expect(read()).toBe('');
  });
});

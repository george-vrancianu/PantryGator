import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewActionBar } from './ReviewActionBar';
import { BUBBLE_BOTTOM_VAR } from '@/components/layout/bubbleVars';
import { renderWithProviders } from '@/test/render';

afterEach(() => vi.restoreAllMocks());

describe('ReviewActionBar', () => {
  it('raises the Gator bubble above itself while mounted', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 88,
    } as DOMRect);
    const view = renderWithProviders(
      <ReviewActionBar
        saveLabel="Save"
        canSave
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const read = () =>
      document.documentElement.style.getPropertyValue(BUBBLE_BOTTOM_VAR);
    expect(read()).toBe('88px');
    view.unmount();
    expect(read()).toBe('');
  });
});

import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUBBLE_BOTTOM_VAR } from './bubbleVars';
import { useBubbleBottomBound } from './useBubbleBottomBound';

const read = () =>
  document.documentElement.style.getPropertyValue(BUBBLE_BOTTOM_VAR);

afterEach(() => vi.restoreAllMocks());

function Bar() {
  const ref = useRef<HTMLDivElement>(null);
  useBubbleBottomBound(ref);
  return <div ref={ref}>bar</div>;
}

describe('useBubbleBottomBound', () => {
  it("writes the bar's height while mounted and clears it on unmount", () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 88,
    } as DOMRect);
    const view = render(<Bar />);
    expect(read()).toBe('88px');
    view.unmount();
    expect(read()).toBe('');
  });

  it('follows a window resize', () => {
    const height = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ height: 60 } as DOMRect);
    const view = render(<Bar />);
    height.mockReturnValue({ height: 72 } as DOMRect);
    window.dispatchEvent(new Event('resize'));
    expect(read()).toBe('72px');
    view.unmount();
  });
});

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { GatorBubblePanel } from './GatorBubblePanel';

describe('GatorBubblePanel', () => {
  it('grows with long text instead of clipping it at a fixed height', () => {
    renderWithProviders(
      <GatorBubblePanel gator={<span>Gator</span>}>
        <span data-testid="line">A very long line that wraps many times</span>
      </GatorBubblePanel>,
    );
    const panel = screen.getByTestId('line').closest('[class*="MuiBox-root"]')
      ?.parentElement?.parentElement as HTMLElement;
    const style = getComputedStyle(panel);
    expect(['', 'auto']).toContain(style.height);
    expect(style.minHeight).toBe('206px');
  });
});

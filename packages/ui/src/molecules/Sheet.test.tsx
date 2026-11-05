import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from '../index';
import { paintedColour } from '../test/colour';
import { renderWithTheme as render } from '../test/render';
import { stubScreen } from '../test/stubScreen';
import { writeAppearance } from '../theme/appearance';

describe('Sheet', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('is a floating bg panel, a step rounder than the Theme card', () => {
    writeAppearance({ theme: 'dark', matchSystem: false });
    render(
      <Sheet open onClose={() => undefined} label="Add items">
        Body
      </Sheet>,
    );
    const sheet = screen.getByRole('dialog', { name: 'Add items' });
    const style = getComputedStyle(sheet);
    expect(paintedColour(sheet, 'background-color')).toBe('#0F1512');
    expect(style.boxShadow).toBe('var(--pp-shadow-float)');
    expect(style.borderRadius).toContain('var(--pp-r-card)');
  });

  describe('slide-up', () => {
    const slideTransition = (reduce: boolean) => {
      stubScreen(false, reduce);
      render(
        <Sheet open onClose={() => undefined} label="Add items">
          Body
        </Sheet>,
      );
      const slider = screen
        .getByRole('dialog', { name: 'Add items' })
        .closest<HTMLElement>('.MuiDialog-container')!;
      return slider.style.transition;
    };

    afterEach(() => vi.unstubAllGlobals());

    it('slides over 340ms by default', () => {
      expect(slideTransition(false)).toContain('340ms');
    });

    it('skips the slide under reduced motion', () => {
      const transition = slideTransition(true);
      expect(transition).toContain('0ms');
      expect(transition).not.toContain('340ms');
    });
  });

  describe('closing', () => {
    const scrim = () => document.querySelector('.MuiBackdrop-root')!;

    it('closes on a scrim tap and on Escape by default', () => {
      const onClose = vi.fn();
      render(
        <Sheet open onClose={onClose} label="Add items">
          Body
        </Sheet>,
      );
      fireEvent.click(scrim());
      expect(onClose).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('ignores scrim taps and Escape when not dismissable', () => {
      const onClose = vi.fn();
      render(
        <Sheet open onClose={onClose} dismissable={false} label="Review">
          Body
        </Sheet>,
      );
      fireEvent.click(scrim());
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Review' })).toBeTruthy();
    });

    it('hands Escape to the caller when not dismissable, but not the scrim tap', () => {
      const onEscape = vi.fn();
      render(
        <Sheet
          open
          onClose={() => undefined}
          dismissable={false}
          onEscape={onEscape}
          label="Review"
        >
          Body
        </Sheet>,
      );
      fireEvent.click(scrim());
      expect(onEscape).not.toHaveBeenCalled();
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(onEscape).toHaveBeenCalledTimes(1);
    });
  });
});

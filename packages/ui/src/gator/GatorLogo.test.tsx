import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GatorLogo, resetGatorLogoEntrance } from './GatorLogo';
import { ONE_SHOT_MS } from './Gator';

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
}
const motion = () => screen.getByRole('button').getAttribute('data-motion');
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
  stubReducedMotion(false);
  resetGatorLogoEntrance();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
});

describe('GatorLogo', () => {
  it('is a button with the given name that calls onClick once per click', () => {
    const onClick = vi.fn();
    render(<GatorLogo label="Refresh" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is a link with `href`, and still plays the Tap when clicked', () => {
    render(<GatorLogo label="Go to Home" href="/" />);
    const link = screen.getByRole('link', { name: 'Go to Home' });
    expect(link.getAttribute('href')).toBe('/');
    expect(screen.queryByRole('button')).toBeNull();
    fireEvent.click(link);
    expect(link.getAttribute('data-motion')).toBe('tap');
  });

  it('draws the head inside the tile clip', () => {
    render(<GatorLogo label="Refresh" />);
    const head = document.querySelector('.head')!;
    expect(head.parentElement?.getAttribute('clip-path')).toMatch(/clipTile/);
  });

  it('fills a tile 6 px larger than the mark with the art', () => {
    render(<GatorLogo label="Refresh" size={42} />);
    expect(getComputedStyle(screen.getByRole('button')).width).toBe('48px');
    expect(document.querySelector('svg')?.getAttribute('width')).toBe('48');
  });

  it("drops the art's olive tile and clips the head to the whole button", () => {
    render(<GatorLogo label="Refresh" />);
    expect(document.querySelector('[fill^="url(#tileClay"]')).toBeNull();
    const clip = document.querySelector('[id^="clipTile"] rect')!;
    expect(clip.getAttribute('width')).toBe('200');
    expect(clip.hasAttribute('rx')).toBe(false);
  });

  it('drops the head shadow and rims the head on Dark only', () => {
    render(<GatorLogo label="Refresh" />);
    const head = document.querySelector('.head')!;
    const hd = document.querySelector('.hd')!;
    expect(getComputedStyle(hd).stroke).not.toBe('rgb(159, 211, 106)');
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(getComputedStyle(head).filter).toBe('none');
    expect(getComputedStyle(hd).stroke).toBe('rgb(159, 211, 106)');
  });

  it('plays the Entrance on the first mount, then idles', () => {
    render(<GatorLogo label="Refresh" />);
    expect(motion()).toBe('entrance');
    advance(ONE_SHOT_MS.entrance);
    expect(motion()).toBe('idle');
  });

  it('starts a later mount in idle', () => {
    render(<GatorLogo label="Refresh" />);
    cleanup();
    render(<GatorLogo label="Refresh" />);
    expect(motion()).toBe('idle');
  });

  it('plays the Tap on each click, then idles', () => {
    render(<GatorLogo label="Refresh" />);
    advance(ONE_SHOT_MS.entrance);
    fireEvent.click(screen.getByRole('button'));
    expect(motion()).toBe('tap');
    advance(ONE_SHOT_MS.tap);
    expect(motion()).toBe('idle');
    fireEvent.click(screen.getByRole('button'));
    expect(motion()).toBe('tap');
  });

  it('cuts the Entrance to the Tap on a click', () => {
    render(<GatorLogo label="Refresh" />);
    advance(300);
    fireEvent.click(screen.getByRole('button'));
    expect(motion()).toBe('tap');
    advance(ONE_SHOT_MS.tap);
    expect(motion()).toBe('idle');
  });

  describe('with reduced motion', () => {
    beforeEach(() => stubReducedMotion(true));

    it('never plays a one-shot, and onClick fires once per click', () => {
      const onClick = vi.fn();
      render(<GatorLogo label="Refresh" onClick={onClick} />);
      expect(motion()).toBe('idle');
      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(motion()).toBe('idle');
      advance(ONE_SHOT_MS.entrance);
      expect(motion()).toBe('idle');
    });
  });

  describe('success signal', () => {
    const mount = (n: number) => <GatorLogo label="Refresh" successCount={n} />;
    beforeEach(() => resetGatorLogoEntrance());

    it('plays the head-only re-entrance when the count rises, then idles', () => {
      const { rerender } = render(mount(0));
      advance(ONE_SHOT_MS.entrance);
      expect(motion()).toBe('idle');
      rerender(mount(1));
      expect(motion()).toBe('reentrance');
      advance(ONE_SHOT_MS.entrance);
      expect(motion()).toBe('idle');
    });

    it('cuts to the Tap on a click during the re-entrance', () => {
      const { rerender } = render(mount(0));
      advance(ONE_SHOT_MS.entrance);
      rerender(mount(1));
      fireEvent.click(screen.getByRole('button'));
      expect(motion()).toBe('tap');
      advance(ONE_SHOT_MS.tap);
      expect(motion()).toBe('idle');
    });

    it('lets a Tap finish before the re-entrance, then idles', () => {
      const { rerender } = render(mount(0));
      advance(ONE_SHOT_MS.entrance);
      fireEvent.click(screen.getByRole('button'));
      advance(300);
      rerender(mount(1));
      expect(motion()).toBe('tap');
      advance(ONE_SHOT_MS.tap - 300);
      expect(motion()).toBe('reentrance');
      advance(ONE_SHOT_MS.entrance);
      expect(motion()).toBe('idle');
    });

    it('does not replay when remounted with a non-zero count', () => {
      render(mount(3));
      advance(ONE_SHOT_MS.entrance);
      expect(motion()).toBe('idle');
    });

    it('stays still under reduced motion', () => {
      stubReducedMotion(true);
      const { rerender } = render(mount(0));
      rerender(mount(1));
      expect(motion()).toBe('idle');
    });
  });
});

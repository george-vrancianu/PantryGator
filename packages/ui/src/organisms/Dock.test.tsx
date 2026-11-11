import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authoredCss } from '../test/authoredCss';
import { paintedColour } from '../test/colour';
import { renderWithTheme as render } from '../test/render';
import { Dock } from './Dock';
import { DockCapsule } from './DockCapsule';

const items = ['Home', 'Shopping', 'Pantry', 'Recipes'].map((label) => ({
  key: label,
  label,
  href: `/${label.toLowerCase()}`,
  icon: <svg />,
}));

function renderDock(teach?: 'camera' | 'mic') {
  return render(
    <Dock
      label="Main"
      items={items}
      activeKey="Pantry"
      teaching={teach !== undefined}
      centre={
        <DockCapsule
          cameraLabel="Camera"
          cameraHref="/scan?mode=receipt"
          micSlot={() => undefined}
          micLabel="Hold to record a Voice Note"
          teach={teach}
        />
      }
    />,
  );
}

/** Whether the lit camera half animates a pulse ring: its own CSS rules name the pulse. */
const pulses = (
  lit: HTMLElement = screen.getByRole('link', { name: 'Camera' }),
) => {
  return Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .filter((rule) =>
      lit.className.split(' ').some((c) => rule.cssText.includes(`.${c}`)),
    )
    .some((rule) => /animation:[^;]*pp-dock-pulse/.test(rule.cssText));
};

describe('Dock teaching the camera', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps the camera a real link and dims everything else out of the tab order', () => {
    renderDock('camera');
    expect(
      screen.getByRole('link', { name: 'Camera' }).getAttribute('href'),
    ).toBe('/scan?mode=receipt');
    for (const name of [
      'Home',
      'Shopping',
      'Pantry',
      'Recipes',
      'Hold to record a Voice Note',
    ]) {
      const control = screen.getByRole('button', { name });
      expect(control.getAttribute('aria-disabled')).toBe('true');
      expect(control.getAttribute('tabindex')).toBe('-1');
      expect(control.hasAttribute('href')).toBe(false);
    }
    expect(
      screen
        .getByRole('button', { name: 'Pantry' })
        .hasAttribute('aria-current'),
    ).toBe(false);
  });

  it('pulses the lit half, but not under reduced motion', () => {
    renderDock('camera');
    expect(pulses()).toBe(true);
    cleanup();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }));
    renderDock('camera');
    expect(pulses()).toBe(false);
  });
});

describe('Dock teaching the mic', () => {
  afterEach(cleanup);

  it('dims the camera and tabs, and leaves the mic half for the real control', () => {
    renderDock('mic');
    for (const name of ['Camera', 'Home', 'Shopping', 'Pantry', 'Recipes']) {
      const control = screen.getByRole('button', { name });
      expect(control.getAttribute('aria-disabled')).toBe('true');
      expect(control.getAttribute('tabindex')).toBe('-1');
    }
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button', { name: /Voice Note/ })).toBeNull();
  });
});

describe('Dock with a non-blocking teach', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const micSlotOf = () =>
    document.querySelector<HTMLElement>(
      '[data-dock-capsule] > div:first-child',
    )!;

  function renderHint(half: 'camera' | 'mic') {
    return render(
      <Dock
        label="Main"
        items={items}
        activeKey="Pantry"
        centre={
          <DockCapsule
            cameraLabel="Camera"
            cameraHref="/scan"
            micSlot={() => undefined}
            highlight={half}
          />
        }
      />,
    );
  }

  it('leaves the tabs and the camera usable while the mic half is lit', () => {
    renderHint('mic');
    for (const name of ['Camera', 'Home', 'Shopping', 'Pantry', 'Recipes']) {
      const control = screen.getByRole('link', { name });
      expect(control.hasAttribute('aria-disabled')).toBe(false);
      expect(control.getAttribute('tabindex')).not.toBe('-1');
    }
    expect(
      screen.getByRole('link', { name: 'Pantry' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('lights the mic half with the butter fill and the pulse ring, and does not dim the camera', () => {
    renderHint('mic');
    expect(paintedColour(micSlotOf(), 'background-color').toUpperCase()).toBe(
      '#F0C96B',
    );
    expect(pulses(micSlotOf())).toBe(true);
    expect(
      getComputedStyle(screen.getByRole('link', { name: 'Camera' })).opacity,
    ).not.toBe('0.4');
  });

  it('lights the chosen half with the pulse ring', () => {
    renderHint('camera');
    expect(pulses()).toBe(true);
  });

  it('does not pulse under reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }));
    renderHint('camera');
    expect(pulses()).toBe(false);
  });
});

describe('Dock not teaching', () => {
  afterEach(cleanup);

  it('is the ordinary navigation', () => {
    renderDock();
    expect(
      screen.getByRole('link', { name: 'Pantry' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(
      screen
        .getByRole('link', { name: 'Camera' })
        .hasAttribute('aria-disabled'),
    ).toBe(false);
  });
});

describe('Dock safe area', () => {
  afterEach(cleanup);

  it('sits at 28px or the bottom inset, whichever is larger, and clears the side insets', () => {
    renderDock();
    const css = authoredCss(screen.getByRole('navigation'));
    expect(css).toContain('bottom:max(28px, env(safe-area-inset-bottom');
    expect(css).toContain('env(safe-area-inset-left');
    expect(css).toContain('env(safe-area-inset-right');
  });
});

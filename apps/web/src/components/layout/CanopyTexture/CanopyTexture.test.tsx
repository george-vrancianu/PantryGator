import { act, fireEvent, screen } from '@testing-library/react';
import { authoredCss } from '@pocket-pantry/ui/test/authoredCss';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { stubMatchMedia } from '@/test/viewport';
import { AppLayout } from '../AppLayout/AppLayout';
import { TEXTURES, type TextureName } from '../canopyTexture';
import { Screen } from '../Screen/Screen';
import { TRANSITION_MS } from '../timing';

function page(title: string) {
  return (
    <Screen title={title}>
      <Link to="/pantry">to /pantry</Link>
      <Link to="/recipes/1">to /recipes/1</Link>
      <Link to="/settings">to /settings</Link>
      <Link to="/">to /</Link>
    </Screen>
  );
}

function renderRoutes(route: string) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={page('Home')} />
        <Route path="/settings" element={page('Settings')} />
        <Route path="/pantry" element={page('Pantry')} />
        <Route path="/recipes/:id" element={page('Recipe')} />
        <Route path="/scan" element={<p>camera</p>} />
      </Route>
    </Routes>,
    { route },
  );
}

const css = (el: Element) => authoredCss(el as HTMLElement);
const texture = () => screen.getByTestId('canopy-texture');
const layers = (kind: 'base' | 'glint') =>
  Array.from(texture().querySelectorAll(`[data-layer="${kind}"]`));
const allCss = () =>
  Array.from(document.querySelectorAll('style[data-emotion]'))
    .map((s) => s.textContent)
    .join('')
    .replaceAll(' ', '');
const glint = () => screen.getByTestId('canopy-glint');
const elapse = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  });
  fireEvent(document, new Event('visibilitychange'));
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    stubApi({
      'GET /api/voice/config': () => Response.json({ configured: false }),
    }).fetchMock,
  );
});
afterEach(() => {
  setHidden(false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('The page texture', () => {
  it('sits behind the header, hidden from assistive tech, with the cream lines at 17 % under the 205deg mask', () => {
    renderRoutes('/pantry');
    const canopy = document.querySelector('[data-region="canopy"]')!;
    expect(canopy.contains(texture())).toBe(true);
    expect(texture().getAttribute('aria-hidden')).toBe('true');
    expect(css(texture())).toContain('linear-gradient(205deg');
    expect(css(layers('base')[0]!.parentElement!)).toContain('opacity:0.17');
  });

  it.each([
    ['/', 'home', '112px 112px', 'opacity:0.8'],
    ['/pantry', 'pantry', '240px 132px', 'opacity:1'],
    ['/recipes/1', 'recipes', '44px 44px', 'opacity:0.9'],
  ] as const)('draws %s with the %s tile', (route, name, size, opacity) => {
    renderRoutes(route);
    const inner = layers('base')[0]!.querySelector('i')!;
    expect(css(inner)).toContain(TEXTURES[name as TextureName].tile);
    expect(css(inner)).toContain(`background-size:${size}`);
    expect(css(inner)).toContain(opacity);
  });

  it('lights the gingham glint through the line-only tile', () => {
    renderRoutes('/recipes/1');
    const inner = glint().querySelector('i')!;
    expect(TEXTURES.recipes.glintTile).not.toBe(TEXTURES.recipes.tile);
    expect(css(inner)).toContain(TEXTURES.recipes.glintTile);
    expect(css(inner)).toContain('var(--pp-tex-glint)');
  });

  it('cross-fades to the next page texture and drops the old one after the transition', async () => {
    renderRoutes('/');
    expect(layers('base')).toHaveLength(1);
    fireEvent.click(screen.getByText('to /pantry'));
    expect(layers('base')).toHaveLength(2);
    expect(layers('base').map((l) => l.getAttribute('data-fade'))).toEqual([
      'leaving',
      'entering',
    ]);
    expect(css(layers('base')[0]!)).toContain(`${TRANSITION_MS}ms`);
    await elapse(TRANSITION_MS);
    expect(layers('base')).toHaveLength(1);
    expect(texture().getAttribute('data-texture')).toBe('pantry');
  });

  it('does not fade between two pages that share a texture', () => {
    renderRoutes('/');
    fireEvent.click(screen.getByText('to /settings'));
    expect(layers('base')).toHaveLength(1);
  });

  it('swaps instantly under reduced motion', () => {
    stubMatchMedia((q) => q.includes('prefers-reduced-motion'));
    renderRoutes('/');
    fireEvent.click(screen.getByText('to /pantry'));
    expect(layers('base')).toHaveLength(1);
    expect(texture().getAttribute('data-texture')).toBe('pantry');
  });
});

describe('The glint', () => {
  it('loops every 10 s, ease-in-out, started 3 s in, through a 46 % slanted window', () => {
    renderRoutes('/');
    const sx = css(glint());
    expect(sx).toContain('10s ease-in-out -3s infinite');
    expect(sx).toContain('mask-size:46% 100%');
    expect(sx).toContain('linear-gradient(100deg');
    expect(sx).toContain('opacity:0.5');
    // 6 s across, 4 s rest.
    expect(allCss()).toMatch(/60%\{[^}]*mask-position:250%0/);
  });

  it('is the same element after navigating, so the loop does not restart', async () => {
    renderRoutes('/');
    const before = glint();
    fireEvent.click(screen.getByText('to /pantry'));
    await elapse(TRANSITION_MS);
    expect(glint()).toBe(before);
    expect(
      document.querySelectorAll('[data-testid="canopy-glint"]'),
    ).toHaveLength(1);
  });

  it('lights the pantry shelves too, and only the pantry slides 240px every 70 s', () => {
    const { unmount } = renderRoutes('/pantry');
    const slide = (el: Element) => css(el.querySelector('i')!);
    expect(slide(layers('base')[0]!)).toContain('70s linear infinite');
    expect(slide(glint())).toContain('70s linear infinite');
    expect(allCss()).toContain('translate3d(-240px,0,0)');
    unmount();
    renderRoutes('/');
    expect(slide(layers('base')[0]!)).not.toContain('70s');
  });

  it('stands still at 62 % and the shelves stay put under reduced motion', () => {
    stubMatchMedia((q) => q.includes('prefers-reduced-motion'));
    renderRoutes('/pantry');
    expect(css(glint())).toContain('mask-position:62% 0');
    expect(css(glint())).not.toContain('animation:');
    expect(css(layers('base')[0]!.querySelector('i')!)).not.toContain('70s');
    expect(css(glint().querySelector('i')!)).not.toContain('70s');
  });

  it('pauses the loops while the page is hidden and resumes when shown', () => {
    renderRoutes('/pantry');
    const targets = () => [glint(), layers('base')[0]!.querySelector('i')!];
    expect(targets().every((t) => css(t).includes('paused'))).toBe(false);
    act(() => setHidden(true));
    expect(
      targets().every((t) => css(t).includes('animation-play-state:paused')),
    ).toBe(true);
    act(() => setHidden(false));
    expect(
      targets().some((t) => css(t).includes('animation-play-state:paused')),
    ).toBe(false);
  });
});

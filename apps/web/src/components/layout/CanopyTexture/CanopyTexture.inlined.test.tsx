import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CanopyTexture } from './CanopyTexture';

/**
 * A production build inlines the small texture tiles as data URIs, and Vite turns the SVG's double
 * quotes into single quotes. A `'` or `(` inside an unquoted `url(...)` is a bad URL token, so the
 * browser would drop the whole declaration and the texture and glint would vanish. Tests and the dev
 * server see plain paths, so this file stands the tiles in as data URIs the way the build emits them.
 */
const { TILE, LINES } = vi.hoisted(() => ({
  TILE: "data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20width='112'%20height='112'%3e%3cpath%20transform='rotate(45)'/%3e%3c/svg%3e",
  LINES:
    "data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20width='44'%20height='44'%3e%3c/svg%3e",
}));

vi.mock('../canopyTexture', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../canopyTexture')>();
  return {
    ...actual,
    TEXTURES: Object.fromEntries(
      Object.entries(actual.TEXTURES).map(([name, t]) => [
        name,
        { ...t, tile: TILE, glintTile: name === 'recipes' ? LINES : TILE },
      ]),
    ),
  };
});

const emittedCss = () =>
  Array.from(document.querySelectorAll('style[data-emotion]'))
    .map((s) => s.textContent ?? '')
    .join('');

describe('The page texture with inlined tiles', () => {
  it('quotes the data URIs so the base tile and the glint mask survive a production build', () => {
    render(
      <MemoryRouter initialEntries={['/recipes/1']}>
        <CanopyTexture />
      </MemoryRouter>,
    );
    const css = emittedCss();
    expect(css).toContain(`background-image:url("${TILE}")`);
    expect(css).toContain(`mask-image:url("${LINES}")`);
    // Every url() the texture writes is quoted.
    expect(css).not.toMatch(/url\((?!["'])/);
  });
});

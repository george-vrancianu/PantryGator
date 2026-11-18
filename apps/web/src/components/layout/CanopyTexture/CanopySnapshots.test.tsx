import { screen } from '@testing-library/react';
import { authoredCss } from '@pocket-pantry/ui/test/authoredCss';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { AppLayout } from '../AppLayout/AppLayout';
import { TEXTURES, type TextureName } from '../canopyTexture';

/**
 * One page per texture, in the Light and the Dark Theme (Canopy handoff section 15). jsdom paints
 * nothing, so the snapshot is the page's structure: the Canopy band with its texture layers, their
 * authored CSS (tile, size, opacity, masks) and the Dock, under the Theme's name. The Theme itself is
 * its CSS variables, set on the root, so Light and Dark differ by `data-theme` here and are painted from
 * the same variables in the browser.
 */
const PAGES: Array<{ texture: TextureName; path: string }> = [
  { texture: 'home', path: '/' },
  { texture: 'shopping', path: '/shopping' },
  { texture: 'pantry', path: '/pantry' },
  { texture: 'recipes', path: '/recipes' },
];

function renderAt(path: string) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppLayout />}>
        {PAGES.map(({ path: p }) => (
          <Route key={p} path={p} element={<p>page</p>} />
        ))}
      </Route>
    </Routes>,
    { route: path },
  );
}

/** Markup with the run-to-run noise (generated ids, inlined texture URIs) replaced by stable names. */
function stable(html: string) {
  let out = html.replace(/_r_\w+_/g, '_r_N_');
  for (const [name, { tile, glintTile }] of Object.entries(TEXTURES)) {
    out = out.split(tile).join(`<tile:${name}>`);
    out = out.split(glintTile).join(`<glint-tile:${name}>`);
  }
  return out;
}

/** Each element's tag, attributes and authored CSS, one per line, in document order. */
function outline(root: Element) {
  return [root, ...Array.from(root.querySelectorAll('*'))]
    .filter((el) => !el.closest('svg') || el.tagName.toLowerCase() === 'svg')
    .map((el) => {
      const attrs = Array.from(el.attributes)
        .filter((a) => a.name !== 'class' && a.name !== 'style')
        .map((a) => `${a.name}="${a.value}"`)
        .join(' ');
      const css =
        typeof (el as HTMLElement).className === 'string'
          ? authoredCss(el as HTMLElement)
          : '';
      // MUI's own ButtonBase boilerplate is not the Canopy's look: keep the rules authored here.
      const authored = css
        .split('\n')
        .filter((rule) => !/MuiButtonBase-root[.:{]|@media print/.test(rule))
        .join('\n');
      return stable(
        `<${el.tagName.toLowerCase()} ${attrs}> ${authored}`.trim(),
      );
    })
    .join('\n');
}

describe.each(['light', 'dark'] as const)(
  'The Canopy in the %s Theme',
  (theme) => {
    afterEach(() => {
      localStorage.clear();
      document.documentElement.removeAttribute('data-theme');
    });

    it.each(PAGES)(
      'wears the $texture texture on $path',
      ({ texture, path }) => {
        localStorage.setItem(
          'pp.appearance',
          JSON.stringify({ theme, matchSystem: false }),
        );
        renderAt(path);
        expect(document.documentElement.dataset.theme).toBe(theme);
        const canopy = document.querySelector('[data-region="canopy"]')!;
        expect(
          canopy.querySelector('[data-testid="canopy-texture"]'),
        ).toHaveAttribute('data-texture', texture);
        const dock = screen.getByRole('navigation');
        expect(
          `data-theme=${theme}\n--- canopy\n${outline(canopy)}\n--- dock\n${outline(dock)}`,
        ).toMatchSnapshot();
      },
    );
  },
);

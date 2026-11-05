import { vi } from 'vitest';

/**
 * Make `matchMedia` answer every `min-width` query as a phone (below `md`) or a 1200 px wide screen.
 * `reduceMotion` makes the `prefers-reduced-motion: reduce` query match.
 */
export function stubScreen(wide: boolean, reduceMotion = false) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    return {
      matches:
        (wide && !!min && 1200 >= Number(min[1])) ||
        (reduceMotion && query.includes('reduce')),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    };
  });
}

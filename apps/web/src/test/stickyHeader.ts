import { expect } from 'vitest';

/** Emotion's raw CSS for the element's own classes. jsdom's getComputedStyle drops `env()` values. */
export function authoredCss(el: HTMLElement): string {
  const classes = el.className.split(' ').filter(Boolean);
  return Array.from(document.querySelectorAll('style[data-emotion]'))
    .map((style) => style.textContent ?? '')
    .join('')
    .split('}')
    .filter((rule) => classes.some((c) => rule.includes(`.${c}`)))
    .join('}');
}

/** Expects the nearest `position: sticky` ancestor of `el` (or `el` itself) to stick below the top inset (ADR 0040). */
export function expectSticksBelowTopInset(el: HTMLElement) {
  let node: HTMLElement | null = el;
  while (node && !authoredCss(node).includes('position:sticky'))
    node = node.parentElement;
  expect(node, 'a sticky ancestor').not.toBeNull();
  expect(authoredCss(node!)).toContain('top:env(safe-area-inset-top');
}

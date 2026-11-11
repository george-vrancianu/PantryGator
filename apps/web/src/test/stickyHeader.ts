import { expect } from 'vitest';
import { authoredCss } from '@pocket-pantry/ui/test/authoredCss';

/** Expects the nearest `position: sticky` ancestor of `el` (or `el` itself) to stick below the top inset (ADR 0040). */
export function expectSticksBelowTopInset(el: HTMLElement) {
  let node: HTMLElement | null = el;
  while (node && !authoredCss(node).includes('position:sticky'))
    node = node.parentElement;
  expect(node, 'a sticky ancestor').not.toBeNull();
  expect(authoredCss(node!)).toContain('top:env(safe-area-inset-top');
}

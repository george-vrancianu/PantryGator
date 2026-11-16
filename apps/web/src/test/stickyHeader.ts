import { expect } from 'vitest';
import { authoredCss } from '@pocket-pantry/ui/test/authoredCss';

/**
 * Expects the nearest `position: sticky` ancestor of `el` (or `el` itself) to stick at the top of its scroller.
 * Inside the shared layout that is the sheet, which already starts below the top inset (ADR 0040 amendment).
 */
export function expectSticksAtScrollerTop(el: HTMLElement) {
  let node: HTMLElement | null = el;
  while (node && !authoredCss(node).includes('position:sticky'))
    node = node.parentElement;
  expect(node, 'a sticky ancestor').not.toBeNull();
  expect(authoredCss(node!)).toMatch(/top:0(px)?(;|\})/);
}

import { onTestFinished } from 'vitest';

type Scroll = { list: Element; top: number; behavior?: ScrollBehavior };

/**
 * jsdom has no layout and no `Element.scrollTo`. This gives every element an `offsetTop` of 1000 × its index among
 * its siblings and records `scrollTo` calls, so a test can ask which child a scrolling list was last brought to
 * (and how), without depending on real offsets. Call it inside a test; it is undone when the test finishes.
 */
export function trackScrolling() {
  const scrolls: Scroll[] = [];
  const offsetTop = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetTop',
  );
  const scrollTo = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'scrollTo',
  );

  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get(this: HTMLElement) {
      const siblings = this.parentElement
        ? [...this.parentElement.children]
        : [this];
      return siblings.indexOf(this) * 1000;
    },
  });
  Object.defineProperty(Element.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value(this: Element, options: ScrollToOptions) {
      scrolls.push({
        list: this,
        top: options.top ?? 0,
        behavior: options.behavior,
      });
    },
  });

  onTestFinished(() => {
    if (offsetTop)
      Object.defineProperty(HTMLElement.prototype, 'offsetTop', offsetTop);
    if (scrollTo)
      Object.defineProperty(Element.prototype, 'scrollTo', scrollTo);
    else delete (Element.prototype as Partial<Element>).scrollTo;
  });

  return {
    /** Every `scrollTo` so far on `list`. */
    scrollsOf: (list: Element) => scrolls.filter((s) => s.list === list),
    /** The child `list` was last scrolled to, with the behaviour used; null if it never scrolled. */
    scrolledTo(list: Element) {
      const last = scrolls.filter((s) => s.list === list).at(-1);
      if (!last) return null;
      return {
        child: list.children[last.top / 1000] as HTMLElement | undefined,
        behavior: last.behavior ?? 'auto',
      };
    },
  };
}

/**
 * jsdom does not scroll. This gives `el` a working `scrollTop` (plus `scrollTo` and `scrollBy`, which move it)
 * that fires a `scroll` event when it changes, as a browser does, and a `scrollHeight` of `height` so
 * content that is too short clamps a restore. Use it on the layout's sheet (`getByTestId('sheet-scroller')`).
 * Setting `scrollTop` directly is a scroll like the Member's; `scrollSheetTo` is the same, spelled out.
 */
export function makeScrollable(el: HTMLElement, { height = 10_000 } = {}) {
  let top = 0;
  const move = (next: number) => {
    const clamped = Math.max(0, Math.min(next, height));
    if (clamped === top) return;
    top = clamped;
    el.dispatchEvent(new Event('scroll'));
  };
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: move,
  });
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => height,
  });
  el.scrollTo = ((options: ScrollToOptions) =>
    move(options.top ?? top)) as typeof el.scrollTo;
  el.scrollBy = ((options: ScrollToOptions) =>
    move(top + (options.top ?? 0))) as typeof el.scrollBy;
  return el;
}

/** Scrolls a `makeScrollable` element to `top`, firing `scroll`. */
export function scrollSheetTo(el: HTMLElement, top: number) {
  el.scrollTop = top;
}

/** Touch events for a pull-to-refresh: down at `from`, move through `to`, optionally release. */
export function pull(
  el: Element,
  {
    from = 100,
    to,
    release = true,
  }: { from?: number; to: number; release?: boolean },
) {
  const touch = (y: number) => ({ touches: [{ clientX: 50, clientY: y }] });
  el.dispatchEvent(
    Object.assign(new Event('touchstart', { bubbles: true }), touch(from)),
  );
  el.dispatchEvent(
    Object.assign(
      new Event('touchmove', { bubbles: true, cancelable: true }),
      touch(to),
    ),
  );
  if (release) el.dispatchEvent(new Event('touchend', { bubbles: true }));
}

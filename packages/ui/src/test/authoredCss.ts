/**
 * The CSS the element's own classes declare, exactly as authored. jsdom's getComputedStyle drops
 * values it cannot parse (`env()`, `max()`) and its stylesheet model mangles them, so tests of
 * safe-area expressions read Emotion's raw `<style>` text instead.
 */
export function authoredCss(el: HTMLElement): string {
  const classes = el.className.split(' ').filter(Boolean);
  const css = Array.from(document.querySelectorAll('style[data-emotion]'))
    .map((style) => style.textContent ?? '')
    .join('');
  return css
    .split('}')
    .filter((rule) => classes.some((c) => rule.includes(`.${c}`)))
    .join('}\n');
}

/**
 * Which shape of the shared layout a route gets (docs/handoffs/canopy/decisions.md, "Shared layout"):
 * - `camera`: no layout at all, the page draws itself edge to edge (`/scan`).
 * - `editor`: top bar only, no header and no pull-to-refresh (the Recipe, meal-plan and template
 *   editors, and Scan Review).
 * - `page`: top bar, header and sheet, with pull-to-refresh.
 */
export type LayoutKind = 'camera' | 'editor' | 'page';

/** A Recipe editor's route: New, Make a Variant (`variant/new`) and Edit. */
export function isRecipeEditor(pathname: string): boolean {
  const [, section = '', second = '', third, fourth] = pathname.split('/');
  return (
    section === 'recipes' &&
    (second === 'new' ||
      (third === 'edit' && fourth === undefined) ||
      (third === 'variant' && fourth === 'new'))
  );
}

export function layoutKindFor(pathname: string): LayoutKind {
  const [, section = '', second = '', third, fourth] = pathname.split('/');
  if (section === 'scan') return second === '' ? 'camera' : 'editor';
  if (section === 'recipes')
    return isRecipeEditor(pathname) ? 'editor' : 'page';
  if (section === 'meal-plans') {
    return second === 'new' || (third === 'edit' && fourth === undefined)
      ? 'editor'
      : 'page';
  }
  // A template's editor: `/shopping/templates/:id`.
  if (section === 'shopping' && second === 'templates' && third)
    return 'editor';
  return 'page';
}

const TAB_ROOTS = ['', '/pantry', '/shopping', '/recipes'];

/** A Dock tab's root screen: its scroll position is restored when the Member comes back to the tab. */
export function isTabRoot(pathname: string): boolean {
  return TAB_ROOTS.includes(pathname.replace(/\/$/, ''));
}

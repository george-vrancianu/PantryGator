import { isRecipeEditor } from './layoutKind';

export type DockState = {
  visible: boolean;
  /** Which of home, shopping, pantry, recipes is highlighted; none on other screens. */
  activeKey: string | undefined;
};

const DOCK_SECTIONS = ['shopping', 'pantry', 'recipes'];

/** Handoff section 3: no dock on /customise or anywhere under /scan, active item by section. */
export function dockStateFor(pathname: string): DockState {
  const [, section = '', second = '', third] = pathname.split('/');
  // A Catalog Recipe's preview has its own bottom bar in the Dock's place.
  const preview =
    section === 'recipes' && second === 'explore' && third !== undefined;
  // The Recipe editor (New, Make a Variant, Edit) has its own header with Back and Save.
  const editor = isRecipeEditor(pathname);
  return {
    // The camera is full-screen and Review has its own sticky action bar: neither shows the dock.
    visible:
      section !== 'customise' && section !== 'scan' && !preview && !editor,
    activeKey:
      section === ''
        ? 'home'
        : DOCK_SECTIONS.includes(section)
          ? section
          : undefined,
  };
}

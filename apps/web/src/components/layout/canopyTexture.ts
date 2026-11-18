import home from '@/assets/textures/tex-home.svg?url';
import pantry from '@/assets/textures/tex-pantry.svg?url';
import recipesLines from '@/assets/textures/tex-recipes-lines.svg?url';
import recipes from '@/assets/textures/tex-recipes.svg?url';
import shopping from '@/assets/textures/tex-shopping.svg?url';

export type TextureName = 'home' | 'shopping' | 'pantry' | 'recipes';

export type Texture = {
  /** The cream line art: the tile drawn at 17 % on the header. */
  tile: string;
  /** The tile the glint is masked by: lines only (the gingham's filled squares must not flash). */
  glintTile: string;
  width: number;
  height: number;
  /** The inner layer's own opacity, on top of the 17 % of the whole texture. */
  opacity: number;
};

export const TEXTURES: Record<TextureName, Texture> = {
  home: { tile: home, glintTile: home, width: 112, height: 112, opacity: 0.8 },
  shopping: {
    tile: shopping,
    glintTile: shopping,
    width: 72,
    height: 72,
    opacity: 0.72,
  },
  pantry: {
    tile: pantry,
    glintTile: pantry,
    width: 240,
    height: 132,
    opacity: 1,
  },
  recipes: {
    tile: recipes,
    glintTile: recipesLines,
    width: 44,
    height: 44,
    opacity: 0.9,
  },
};

/** One tile of the Pantry shelves: how far they slide. */
export const SHELF_SLIDE_PX = 240;

/**
 * The page texture for a path. Home, Intro and Settings use the diagonal tiles, and so does every page
 * nobody has drawn a texture for yet (Meal plan, Admin, Family, Staples, Templates).
 */
export function textureFor(pathname: string): TextureName {
  const [, first = '', second = ''] = pathname.split('/');
  if (first === 'shopping') {
    return second === 'staples' || second === 'templates' ? 'home' : 'shopping';
  }
  if (first === 'pantry') return 'pantry';
  if (first === 'recipes') return 'recipes';
  return 'home';
}

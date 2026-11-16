import { describe, expect, it } from 'vitest';
import { textureFor } from './canopyTexture';

describe('textureFor', () => {
  it.each([
    ['/', 'home'],
    ['/settings', 'home'],
    ['/intro/setup', 'home'],
    ['/shopping', 'shopping'],
    ['/shopping/staples', 'home'],
    ['/shopping/templates/3', 'home'],
    ['/pantry', 'pantry'],
    ['/recipes', 'recipes'],
    ['/recipes/12', 'recipes'],
    ['/recipes/explore', 'recipes'],
    ['/meal-plans', 'home'],
    ['/admin', 'home'],
    ['/family', 'home'],
  ])('%s uses %s', (path, texture) => {
    expect(textureFor(path)).toBe(texture);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'fonts.css'), 'utf8');

type Face = { family: string; src: string; unicodeRange: string };

function fontFaces(source: string): Face[] {
  return [...source.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => {
    const prop = (name: string) =>
      body.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim() ?? '';
    return {
      family: prop('font-family').replace(/['"]/g, ''),
      src: prop('src'),
      unicodeRange: prop('unicode-range'),
    };
  });
}

const faces = fontFaces(css);
const familiesOf = (list: Face[]) => [...new Set(list.map((f) => f.family))];

describe('self-hosted Canopy fonts', () => {
  it('declares only the two Canopy families under the names the Themes use', () => {
    expect(familiesOf(faces).sort()).toEqual(['Figtree', 'Schibsted Grotesk']);
  });

  it('subsets every family to Latin and Latin-ext only', () => {
    for (const family of familiesOf(faces)) {
      const files = faces
        .filter((f) => f.family === family)
        .map((f) => f.src.match(/-(latin(?:-ext)?)-/)?.[1]);
      expect(files.sort(), family).toEqual(['latin', 'latin-ext']);
    }
  });

  it('covers Danish and Romanian letters', () => {
    // æ ø å (Latin-1) and ă â î ș ț (Latin Extended).
    const codePoints = [0xe6, 0xf8, 0xe5, 0x103, 0xe2, 0xee, 0x219, 0x21b];
    const covers = (range: string, cp: number) =>
      range.split(',').some((part) => {
        const [lo, hi = lo] = part.trim().replace('U+', '').split('-');
        return cp >= parseInt(lo, 16) && cp <= parseInt(hi, 16);
      });
    for (const family of familiesOf(faces)) {
      const ranges = faces.filter((f) => f.family === family);
      for (const cp of codePoints) {
        expect(
          ranges.some((f) => covers(f.unicodeRange, cp)),
          `${family} U+${cp.toString(16)}`,
        ).toBe(true);
      }
    }
  });

  it('serves every file from the bundled @fontsource-variable packages', () => {
    for (const face of faces) {
      expect(face.src).toMatch(/url\(["']?@fontsource-variable\//);
    }
  });
});

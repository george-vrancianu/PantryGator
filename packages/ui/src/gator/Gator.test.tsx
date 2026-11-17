import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { Gator, ONE_SHOT_MS, type GatorProps } from './Gator';
import { GATOR_GEOMETRY, GATOR_MOODS, type GatorMood } from './gatorGeometry';

const ALTS: Record<GatorMood, string> = {
  'shopping-buddy': 'Gator waving, holding a shopping basket',
  'app-icon': 'Gator, the app icon',
  talking: 'Gator talking',
  happy: 'Gator, happy',
  proud: 'Gator beaming with pride, eyes closed in a big grin',
  listening: 'Gator listening',
  thinking: 'Gator thinking',
  'list-keeper': 'Gator in glasses reading the receipt',
  worried: 'Gator, worried',
  chef: 'Gator the chef stirring a pot',
  'chef-flop': 'Gator, disappointed, with the cooking tools dropped',
};
const MOODS = GATOR_MOODS;
const VARIANTS = ['idle', 'signature', 'entrance', 'tap'] as const;

const art = import.meta.glob<string>('./art/gator-*-*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const artOf = (mood: string, variant: string) =>
  art[`./art/gator-${mood}-${variant}.svg`];

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
}

const image = (container: HTMLElement) => container.querySelector('img')!;
const motion = (container: HTMLElement) =>
  image(container).getAttribute('data-motion');
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
  stubReducedMotion(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Gator', () => {
  describe('Tap', () => {
    function stubTapFetch() {
      const urls: string[] = [];
      vi.stubGlobal('fetch', (url: string) => {
        urls.push(url);
        return Promise.resolve(
          new Response(`<svg data-art="${url}"></svg>`, { status: 200 }),
        );
      });
      return urls;
    }
    const tapUrl = (mood: string) => new RegExp(`gator-${mood}-tap\\.svg`);
    const flushFetch = () => act(async () => {});

    it('fetches no Tap file for a Gator that cannot tap', () => {
      const urls = stubTapFetch();
      render(<Gator mood="happy" alt="a" />);
      expect(urls.some((url) => tapUrl('happy').test(url))).toBe(false);
    });

    it('warms the Tap file when a parent can start one', () => {
      const urls = stubTapFetch();
      render(<Gator mood="talking" alt="a" tapSignal={0} />);
      expect(urls.some((url) => tapUrl('talking').test(url))).toBe(true);
    });

    // WebKit shares one animation clock between images of a URL, so a reused URL shows a Tap
    // that has already played out.
    it('gives each Tap its own source, so every Tap plays from its first frame', async () => {
      stubTapFetch();
      const { container, rerender } = render(
        <Gator mood="worried" alt="a" entrance={false} tapSignal={0} />,
      );
      await flushFetch();
      rerender(<Gator mood="worried" alt="a" entrance={false} tapSignal={1} />);
      const first = image(container).getAttribute('src')!;
      expect(first).toMatch(/^data:image\/svg\+xml,/);
      expect(decodeURIComponent(first)).toMatch(tapUrl('worried'));
      rerender(<Gator mood="worried" alt="a" entrance={false} tapSignal={2} />);
      const second = image(container).getAttribute('src')!;
      expect(second).toMatch(/^data:image\/svg\+xml,/);
      expect(second).not.toBe(first);
    });

    it('gives a remounted or second same-mood Gator its own Tap source', async () => {
      stubTapFetch();
      const tapped = async () => {
        const { container, rerender, unmount } = render(
          <Gator mood="worried" alt="a" entrance={false} tapSignal={0} />,
        );
        await flushFetch();
        rerender(
          <Gator mood="worried" alt="a" entrance={false} tapSignal={1} />,
        );
        const src = image(container).getAttribute('src')!;
        return { src, unmount };
      };
      const first = await tapped();
      first.unmount();
      const second = await tapped();
      const third = await tapped();
      expect(second.src).not.toBe(first.src);
      expect(third.src).not.toBe(second.src);
    });

    it('plays the Tap from the file while its text is not in yet', () => {
      vi.stubGlobal('fetch', () => new Promise(() => {}));
      const { container, rerender } = render(
        <Gator mood="thinking" alt="a" entrance={false} tapSignal={0} />,
      );
      rerender(
        <Gator mood="thinking" alt="a" entrance={false} tapSignal={1} />,
      );
      expect(image(container).getAttribute('src')).toMatch(tapUrl('thinking'));
    });

    it('is a button named by its alt, and taps then returns to the loop', () => {
      const onClick = vi.fn();
      const { container } = render(
        <Gator
          mood="happy"
          alt="Gator, happy"
          entrance={false}
          onClick={onClick}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Gator, happy' }));
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(motion(container)).toBe('tap');
      advance(ONE_SHOT_MS.tap - 1);
      expect(motion(container)).toBe('tap');
      advance(1);
      expect(motion(container)).toBe('idle');
    });

    it('returns to the signature loop after the Tap', () => {
      const { container } = render(
        <Gator
          mood="happy"
          alt="a"
          entrance={false}
          loop="signature"
          onClick={() => {}}
        />,
      );
      fireEvent.click(screen.getByRole('button'));
      advance(ONE_SHOT_MS.tap);
      expect(motion(container)).toBe('signature');
    });

    it('restarts on a second click, from the first frame', () => {
      const onClick = vi.fn();
      const { container } = render(
        <Gator mood="happy" alt="a" entrance={false} onClick={onClick} />,
      );
      const button = screen.getByRole('button');
      fireEvent.click(button);
      const first = image(container);
      advance(500);
      fireEvent.click(button);
      expect(image(container)).not.toBe(first);
      advance(ONE_SHOT_MS.tap - 1);
      expect(motion(container)).toBe('tap');
      expect(onClick).toHaveBeenCalledTimes(2);
      advance(1);
      expect(motion(container)).toBe('idle');
    });

    it('plays the Tap during the Entrance, then the loop', () => {
      const { container } = render(
        <Gator mood="happy" alt="a" onClick={() => {}} />,
      );
      advance(300);
      fireEvent.click(screen.getByRole('button'));
      expect(motion(container)).toBe('tap');
      advance(ONE_SHOT_MS.tap);
      expect(motion(container)).toBe('idle');
    });

    it('is not a button without onClick, and a click changes nothing', () => {
      const { container } = render(
        <Gator mood="happy" alt="a" entrance={false} />,
      );
      expect(screen.queryByRole('button')).toBeNull();
      fireEvent.click(image(container));
      expect(motion(container)).toBe('idle');
    });

    it('plays when a parent bumps tapSignal, with no button', () => {
      const { container, rerender } = render(
        <Gator mood="happy" alt="a" entrance={false} tapSignal={0} />,
      );
      expect(motion(container)).toBe('idle');
      rerender(<Gator mood="happy" alt="a" entrance={false} tapSignal={1} />);
      expect(motion(container)).toBe('tap');
      expect(screen.queryByRole('button')).toBeNull();
      advance(ONE_SHOT_MS.tap);
      expect(motion(container)).toBe('idle');
    });

    it('shows no Tap under reduced motion, but onClick still fires', () => {
      stubReducedMotion(true);
      const onClick = vi.fn();
      const { container, rerender } = render(
        <Gator mood="happy" alt="a" onClick={onClick} tapSignal={0} />,
      );
      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(motion(container)).toBe('idle');
      rerender(<Gator mood="happy" alt="a" onClick={onClick} tapSignal={1} />);
      expect(motion(container)).toBe('idle');
    });
  });

  it.each(Object.entries(ALTS))('renders %s with its alt', (mood, alt) => {
    const { container } = render(<Gator mood={mood as GatorMood} alt={alt} />);
    expect(screen.getByRole('img', { name: alt })).toBeTruthy();
    expect(image(container).getAttribute('data-mood')).toBe(mood);
  });

  it('has the 11 moods, each with a described alt', () => {
    expect(GATOR_MOODS).toHaveLength(11);
    expect(Object.keys(ALTS).sort()).toEqual([...GATOR_MOODS].sort());
  });

  describe('chef-flop, the disappointed chef', () => {
    const src = (container: HTMLElement) =>
      image(container).getAttribute('src');

    it('plays its own Entrance, then settles into its loop', () => {
      const { container } = render(<Gator mood="chef-flop" alt="a" />);
      expect(src(container)).toMatch(/gator-chef-flop-entrance/);
      advance(ONE_SHOT_MS.entrance);
      expect(src(container)).toMatch(/gator-chef-flop-idle/);
    });

    it('keeps the same image element when switching to and from chef', () => {
      const { container, rerender } = render(<Gator mood="chef" alt="a" />);
      const img = image(container);
      rerender(<Gator mood="chef-flop" alt="a" />);
      expect(image(container)).toBe(img);
      expect(src(container)).toMatch(/gator-chef-flop-idle/);
      rerender(<Gator mood="chef" alt="a" />);
      expect(image(container)).toBe(img);
      expect(src(container)).toMatch(/gator-chef-idle/);
    });

    it('is its own drawing, keeping the hat and dropping the pot and whisk', () => {
      const flop = artOf('chef-flop', 'idle')!;
      expect(flop).not.toBe(artOf('chef', 'idle'));
      expect(flop).toContain('class="pot"');
      expect(flop).toContain('class="whiskdown"');
      expect(flop).toContain('fill="#8CCBEA"');
      expect(artOf('chef-flop', 'signature')).toContain('@keyframes sigh');
    });
  });

  it('is empty-alt and hidden from assistive tech when decorative', () => {
    const { container } = render(<Gator mood="chef" decorative />);
    expect(image(container).getAttribute('alt')).toBe('');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('plays the Entrance, then the idle loop after 1300 ms', () => {
    const { container } = render(<Gator mood="happy" decorative />);
    expect(motion(container)).toBe('entrance');
    advance(1299);
    expect(motion(container)).toBe('entrance');
    advance(1);
    expect(motion(container)).toBe('idle');
  });

  it('ends on the signature loop when asked', () => {
    const { container } = render(
      <Gator mood="shopping-buddy" loop="signature" decorative />,
    );
    expect(motion(container)).toBe('entrance');
    advance(ONE_SHOT_MS.entrance);
    expect(motion(container)).toBe('signature');
  });

  it('starts on the loop without the Entrance', () => {
    const { container } = render(
      <Gator mood="happy" entrance={false} loop="signature" decorative />,
    );
    expect(motion(container)).toBe('signature');
    advance(5000);
    expect(motion(container)).toBe('signature');
  });

  it('goes straight to the new mood loop when the mood changes', () => {
    const { container, rerender } = render(<Gator mood="happy" decorative />);
    advance(ONE_SHOT_MS.entrance);
    rerender(<Gator mood="worried" decorative />);
    expect(image(container).getAttribute('data-mood')).toBe('worried');
    expect(motion(container)).toBe('idle');
  });

  it('skips the rest of the Entrance on a mood change', () => {
    const { container, rerender } = render(<Gator mood="happy" decorative />);
    advance(500);
    rerender(<Gator mood="worried" decorative />);
    expect(motion(container)).toBe('idle');
  });

  it('does not replay a cut-short Entrance when the mood changes back', () => {
    const { container, rerender } = render(<Gator mood="happy" decorative />);
    advance(500);
    rerender(<Gator mood="worried" decorative />);
    expect(motion(container)).toBe('idle');
    advance(300);
    rerender(<Gator mood="happy" decorative />);
    expect(motion(container)).toBe('idle');
    advance(1000);
    expect(motion(container)).toBe('idle');
  });

  it('switches loops when the loop changes', () => {
    const { container, rerender } = render(
      <Gator mood="happy" decorative entrance={false} />,
    );
    expect(motion(container)).toBe('idle');
    rerender(
      <Gator mood="happy" decorative entrance={false} loop="signature" />,
    );
    expect(motion(container)).toBe('signature');
  });

  it('switches loops after a one-shot in progress', () => {
    const { container, rerender } = render(<Gator mood="happy" decorative />);
    rerender(<Gator mood="happy" decorative loop="signature" />);
    expect(motion(container)).toBe('entrance');
    advance(ONE_SHOT_MS.entrance);
    expect(motion(container)).toBe('signature');
  });

  it('keeps the same image element while switching, so the old art stays until the new one loads', () => {
    const { container } = render(<Gator mood="happy" decorative />);
    const before = image(container);
    advance(ONE_SHOT_MS.entrance);
    expect(image(container)).toBe(before);
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  describe('with reduced motion', () => {
    beforeEach(() => stubReducedMotion(true));

    it('only ever shows the loop', () => {
      const { container, rerender } = render(
        <Gator mood="happy" loop="signature" decorative />,
      );
      expect(motion(container)).toBe('signature');
      advance(ONE_SHOT_MS.entrance);
      expect(motion(container)).toBe('signature');
      rerender(<Gator mood="worried" decorative />);
      expect(motion(container)).toBe('idle');
    });

    it('shows no half-played Entrance if reduced motion is turned off later', () => {
      const { container, rerender } = render(<Gator mood="happy" decorative />);
      stubReducedMotion(false);
      advance(500);
      rerender(<Gator mood="happy" decorative />);
      expect(motion(container)).toBe('idle');
    });
  });

  describe('sizing', () => {
    it.each(MOODS)(
      'renders the %s drawing at size and keeps the layout box',
      (mood) => {
        const { container } = render(
          <Gator mood={mood} size={200} decorative />,
        );
        const img = image(container);
        const { drawing } = GATOR_GEOMETRY[mood];
        const scale = 200 / drawing[2];
        const box = img.parentElement!;
        expect(box.style.display).toBe('flow-root');
        expect(Number.parseFloat(box.style.width)).toBeCloseTo(200);
        expect(Number.parseFloat(box.style.height)).toBeCloseTo(
          drawing[3] * scale,
        );
        const px = (v: string) => Number.parseFloat(v);
        const {
          width,
          height,
          marginLeft,
          marginRight,
          marginTop,
          marginBottom,
        } = img.style;
        // Image width + horizontal margins = the drawing's box.
        expect(px(width) + px(marginLeft) + px(marginRight)).toBeCloseTo(200);
        expect(px(height) + px(marginTop) + px(marginBottom)).toBeCloseTo(
          drawing[3] * scale,
        );
        // The padding hangs outside, never shrinks the box.
        for (const m of [marginLeft, marginRight, marginTop, marginBottom]) {
          expect(px(m)).toBeLessThanOrEqual(0);
        }
        expect(px(width)).toBeGreaterThan(200);
      },
    );

    it('defaults to 96 wide', () => {
      const { container } = render(<Gator mood="happy" decorative />);
      const img = image(container);
      const s = img.style;
      expect(
        Number.parseFloat(s.width) +
          Number.parseFloat(s.marginLeft) +
          Number.parseFloat(s.marginRight),
      ).toBeCloseTo(96);
    });
  });

  it('requires an alt unless decorative', () => {
    // Compile-time only (checked by the ui typecheck).
    const ok: GatorProps[] = [
      { mood: 'happy', alt: 'x' },
      { mood: 'happy', decorative: true },
    ];
    expect(ok).toHaveLength(2);
    // @ts-expect-error alt is required unless decorative
    const bad: GatorProps = { mood: 'happy' };
    expect(bad).toBeTruthy();
    expectTypeOf<{ mood: 'happy' }>().not.toExtend<GatorProps>();
    expectTypeOf<{ mood: 'happy'; alt: string }>().toExtend<GatorProps>();
    expectTypeOf<{ mood: 'happy'; decorative: true }>().toExtend<GatorProps>();
    expectTypeOf<{
      mood: 'happy';
      decorative: true;
      alt: string;
    }>().not.toExtend<GatorProps>();
    expectTypeOf<{
      mood: 'happy';
      decorative: true;
      onClick: () => void;
    }>().not.toExtend<GatorProps>();
  });
});

describe('Gator art', () => {
  it('has a geometry entry for every mood', () => {
    expect(Object.keys(GATOR_GEOMETRY).sort()).toEqual([...MOODS].sort());
  });

  it.each(MOODS)('has all four variant files for %s', (mood) => {
    for (const variant of VARIANTS) {
      expect(artOf(mood, variant), `${mood} ${variant}`).toMatch(/^<svg/);
    }
  });

  it.each(MOODS)(
    'shares one viewBox across the %s variants, as geometry says',
    (mood) => {
      const expected = GATOR_GEOMETRY[mood].view.join(' ');
      for (const variant of VARIANTS) {
        expect(/viewBox="([^"]*)"/.exec(artOf(mood, variant)!)?.[1]).toBe(
          expected,
        );
      }
    },
  );

  it('keeps every Gator animated art file free of external references', () => {
    for (const text of Object.values(art)) {
      expect(text).not.toMatch(/href="https?:/);
    }
  });

  /** Longest animation end in ms: delay + duration x iterations; Infinity if it loops. */
  function longestAnimationMs(svg: string): number {
    const css = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? '';
    expect(css).not.toMatch(/animation-(delay|duration|iteration-count)/);
    let longest = 0;
    for (const [, value] of css.matchAll(/animation:([^;}]*)/g)) {
      if (/^\s*none/.test(value!)) continue;
      const times = [...value!.matchAll(/(-?\d*\.?\d+)(ms|s)\b/g)].map(
        ([, n, unit]) => Number(n) * (unit === 's' ? 1000 : 1),
      );
      const duration = times[0] ?? 0;
      const delay = times[1] ?? 0;
      const rest = value!.replace(/(-?\d*\.?\d+)(ms|s)\b/g, '');
      const count = /infinite/.test(rest)
        ? Infinity
        : Number(/(?:^|\s)(\d*\.?\d+)(?=\s|$)/.exec(rest)?.[1] ?? 1);
      longest = Math.max(longest, delay + duration * count);
    }
    return longest;
  }

  it('measures a looping animation as endless', () => {
    expect(
      longestAnimationMs('<style>.a{animation:x 1s ease infinite}</style>'),
    ).toBe(Infinity);
    expect(
      longestAnimationMs(
        '<style>.a{animation:x .5s linear .2s 2 both}</style>',
      ),
    ).toBeCloseTo(1200);
  });

  it.each(MOODS)('ends the %s Entrance within 1300 ms', (mood) => {
    const longest = longestAnimationMs(artOf(mood, 'entrance')!);
    expect(longest).toBeGreaterThan(0);
    expect(longest).toBeLessThanOrEqual(ONE_SHOT_MS.entrance);
  });

  it.each(MOODS)('ends the %s Tap within 900 ms', (mood) => {
    const longest = longestAnimationMs(artOf(mood, 'tap')!);
    expect(longest).toBeGreaterThan(0);
    expect(longest).toBeLessThanOrEqual(ONE_SHOT_MS.tap);
  });

  it.each(MOODS)('stops the %s loops under reduced motion', (mood) => {
    for (const variant of ['idle', 'signature']) {
      expect(artOf(mood, variant)).toMatch(
        /@media \(prefers-reduced-motion: reduce\)\{svg \*\{animation:none !important\}\}/,
      );
    }
  });
});

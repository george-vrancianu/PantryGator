import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NEEDLE_TURN_MS } from '../../../components/HealthSheet/HealthDial';
import { LAMP_FADE_MS } from '../../../components/HealthSheet/HealthLamp';
import type { Batch } from '../../../lib/pantry';
import type { Staple } from '../../../lib/staples';
import { renderWithProviders, stubApi } from '../../../test/render';
import { stubMotion } from '../../../test/viewport';
import { authoredCss } from '@pocket-pantry/ui/test/authoredCss';
import { PantryHealthCluster } from './PantryHealthCluster';

const isoIn = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

let counter = 0;
const batch = (overrides: Partial<Batch> = {}): Batch => {
  counter += 1;
  return {
    id: `b${counter}`,
    name: 'Item',
    ingredientId: `ing${counter}`,
    unmatched: false,
    aisle: null,
    amountScale: null,
    defaultUnit: null,
    defaultExpiryDays: null,
    quantity: null,
    unit: null,
    location: 'fridge',
    expiryDate: isoIn(30),
    productDescription: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
};

const staple = (ingredientId: string): Staple => ({
  id: `s-${ingredientId}`,
  ingredientId,
  name: ingredientId,
  quantity: null,
  unit: null,
  aisle: null,
});

/**
 * Ten Batches: eight in date, one expired, one undated; two Staples, one stocked and one missing.
 * Fresh 89, Supply 90, Dated 90, Rotation 100: 91, with three Health To-dos (expired, missing Staple, undated).
 */
function tenBatchPantry() {
  return {
    batches: [
      batch({ ingredientId: 'milk' }),
      ...Array.from({ length: 7 }, () => batch()),
      batch({ expiryDate: isoIn(-2) }),
      batch({ expiryDate: null }),
    ],
    runningLow: [] as string[],
  };
}

function stub(
  pantry: { batches: Batch[]; runningLow: string[] },
  staples: Staple[] = [staple('milk'), staple('eggs')],
  settings: () => Response | Promise<Response> = () =>
    Response.json({ staleThresholdDays: 3, expiryOverrides: [] }),
  dismissed: string[] = [],
  extraRoutes: Record<string, (url: URL) => Response | Promise<Response>> = {},
) {
  const { fetchMock, calls } = stubApi({
    'GET /api/settings/family': settings,
    'GET /api/pantry': () => Response.json(pantry),
    'GET /api/shopping-list/suggestions': () =>
      Response.json({
        staples: [],
        usedUp: [],
        runningLow: [],
        expired: [],
        dismissed,
      }),
    'GET /api/pantry/last-stocked': () =>
      Response.json({ lastStockedAt: null }),
    'GET /api/staples': () => Response.json({ staples }),
    'GET /api/shopping-list': () =>
      Response.json({
        id: 'l1',
        groups: [],
        summary: { remaining: 0, checked: 0 },
      }),
    ...extraRoutes,
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

/** The element's markup under the active Theme: a Theme is its CSS variables, set on the root. */
const snapshotOf = (element: Element) =>
  `data-theme=${document.documentElement.dataset.theme}\n${element.outerHTML.replace(/_r_\w+_/g, '_r_N_').replace(/src="[^"]*\/(gator-[\w-]+\.svg)"/g, 'src="$1"')}`;

/** The disclosure button of a Health To-do; its bulk button shares the start of the name. */
const disclosure = (sheet: HTMLElement, name: RegExp) =>
  within(sheet).getByRole('button', { name, expanded: false });

/** The items a disclosure button controls. */
const itemsOf = (button: HTMLElement) =>
  within(
    document.getElementById(
      button.getAttribute('aria-controls') as string,
    ) as HTMLElement,
  ).getAllByRole('listitem');

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** Whether the toast with this text sits in the polite live region (spec #323), not the assertive one. */
const politeToast = (text: string | RegExp) =>
  screen.getByText(text).closest('[role="status"]') !== null;

/** The dial's `data-angle` for a score as a fraction. */
const angleOf = (score: number) => (-60 + 120 * score).toFixed(1);

const renderPantryHealth = (locale: 'en' | 'ro' | 'da' = 'en') =>
  renderWithProviders(<PantryHealthCluster />, { locale });

/** "expired:true": which lamp it is and whether it is lit. */
const lamp = (element: Element) =>
  `${element.getAttribute('data-lamp')}:${element.getAttribute('data-lit')}`;

describe('PantryHealthCluster', () => {
  it('shows the dial, verdict, summary and four lights, named for a screen reader', async () => {
    stub(tenBatchPantry());

    renderPantryHealth();

    const button = await screen.findByRole('button', {
      name: 'Pantry health: In good shape, 1 expired.',
    });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveTextContent('In good shape');
    expect(button).toHaveTextContent('3 to do · Toss 1 expired');
    expect(within(button).getByTestId('health-dial')).toHaveAttribute(
      'data-angle',
      angleOf(0.91),
    );
    expect([...button.querySelectorAll('[data-lamp]')].map(lamp)).toEqual([
      'expired:true',
      'soon:false',
      'low:false',
      'fresh:false',
    ]);
    // The score number is only on the sheet.
    expect(button).not.toHaveTextContent('91');
  });

  /** The Health Factor rows of the open sheet, as "supply 90". */
  const factorRows = (sheet: HTMLElement) =>
    [...sheet.querySelectorAll('[data-factor]')].map(
      (row) =>
        `${row.getAttribute('data-factor')} ${row.lastElementChild?.textContent}`,
    );

  async function openSheetOf() {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^[^:]+: / }));
    return {
      user,
      sheet: await screen.findByRole('dialog', {
        name: /^(Pantry health|Starea cămării|Spisekammerets tilstand)$/,
      }),
    };
  }

  it.each([
    ['en', 'Supply'],
    ['ro', 'Provizii'],
    ['da', 'Forråd'],
  ] as const)(
    'names the second Health Factor Supply in the sheet in %s',
    async (locale, name) => {
      stub(tenBatchPantry());

      renderPantryHealth(locale);
      const { sheet } = await openSheetOf();

      const row = sheet.querySelector('[data-factor="supply"]') as HTMLElement;
      expect(row).toHaveTextContent(name);
      expect(row).toHaveTextContent('90');
      expect(sheet).not.toHaveTextContent('Staples');
    },
  );

  it('shows three bars and no Fresh value when there are no dated Batches', async () => {
    stub(
      {
        batches: Array.from({ length: 10 }, () => batch({ expiryDate: null })),
        runningLow: [],
      },
      [],
    );

    renderPantryHealth();
    const { sheet } = await openSheetOf();

    expect(factorRows(sheet)).toEqual([
      'supply 100',
      'dated 0',
      'rotation 100',
    ]);
    expect(sheet).not.toHaveTextContent('Fresh');
  });

  it('shows three bars and no Supply value when only Unmatched Batches are held', async () => {
    stub(
      {
        batches: Array.from({ length: 10 }, () =>
          batch({ ingredientId: null, unmatched: true }),
        ),
        runningLow: [],
      },
      [],
    );

    renderPantryHealth();
    const { sheet } = await openSheetOf();

    expect(factorRows(sheet)).toEqual([
      'fresh 100',
      'dated 100',
      'rotation 100',
    ]);
    expect(sheet).not.toHaveTextContent('Supply');
  });

  it('counts a dismissed missing Staple neither for nor against the score', async () => {
    // Eggs is not a Staple at all: the score a dismissed Staple must match.
    stub(tenBatchPantry(), [staple('milk')]);
    const first = renderPantryHealth();
    const { sheet: firstSheet } = await openSheetOf();
    expect(within(firstSheet).getByTestId('health-score')).toHaveTextContent(
      '96 of 100',
    );
    first.unmount();
    vi.unstubAllGlobals();

    stub(tenBatchPantry(), [staple('milk'), staple('eggs')], undefined, [
      'eggs',
    ]);
    renderPantryHealth();
    const { sheet } = await openSheetOf();

    // Fresh 89, Supply 100 (eggs left out), Dated 90, Rotation 100.
    expect(within(sheet).getByTestId('health-score')).toHaveTextContent(
      '96 of 100',
    );
  });

  it('says there is nothing to do for a Pantry in order, with no lamp lit', async () => {
    stub(
      {
        batches: Array.from({ length: 10 }, () => batch()),
        runningLow: [],
      },
      [],
    );

    renderPantryHealth();

    const button = await screen.findByRole('button', {
      name: 'Pantry health: In good shape, no warning lights.',
    });
    expect(button).toHaveTextContent('Nothing to do');
    expect(button.querySelectorAll('[data-lit="true"]')).toHaveLength(0);
  });

  it('shows "Not enough to judge yet", a parked needle and no lit lamp under ten Batches', async () => {
    stub(
      {
        batches: [batch(), batch(), batch(), batch({ expiryDate: isoIn(-1) })],
        runningLow: [] as string[],
      },
      [],
      undefined,
      [],
      {
        'GET /api/pantry/last-stocked': () =>
          Response.json({ lastStockedAt: new Date().toISOString() }),
      },
    );

    renderPantryHealth();

    const button = await screen.findByRole('button', {
      name: 'Pantry health: Not enough to judge yet, no warning lights.',
    });
    expect(button).toHaveTextContent('Not enough to judge yet');
    expect(button).toHaveTextContent(
      'Add 6 more to the Pantry to get your score',
    );
    const dial = within(button).getByTestId('health-dial');
    expect(dial).toHaveAttribute('data-parked', 'true');
    expect(dial).toHaveAttribute('data-angle', '-60.0');
    // One Batch is expired and one was just stocked, yet nothing is lit.
    expect(button.querySelectorAll('[data-lit="true"]')).toHaveLength(0);
    expect(button.querySelectorAll('[data-lamp]')).toHaveLength(4);
  });

  it('shows a loading header the same size until the Family Settings are in, so the default Stale Threshold never shows', async () => {
    let release: () => void = () => {};
    const settingsLoaded = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = stub(
      {
        batches: [
          ...Array.from({ length: 9 }, () => batch()),
          batch({ expiryDate: isoIn(5) }),
        ],
        runningLow: [],
      },
      [],
      async () => {
        await settingsLoaded;
        return Response.json({ staleThresholdDays: 10, expiryOverrides: [] });
      },
    );

    renderPantryHealth();

    await waitFor(() =>
      expect(calls.some((call) => call.key === 'GET /api/pantry')).toBe(true),
    );
    expect(screen.getByTestId('health-cluster-loading')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    release();
    // With the default threshold of 3 the Batch five days out would count as fresh and the score be 100.
    const { sheet } = await openSheetOf();
    expect(within(sheet).getByTestId('health-score')).toHaveTextContent(
      '99 of 100',
    );
  });

  it('speaks Romanian', async () => {
    stub({ batches: [batch()], runningLow: [] }, []);

    renderPantryHealth('ro');

    expect(
      await screen.findByRole('button', { name: /^Starea cămării: / }),
    ).toHaveTextContent('Adaugă încă 9 în cămară');
  });

  describe('the lights', () => {
    const daysAgo = (days: number) => {
      const date = new Date();
      date.setDate(date.getDate() - days);
      return date.toISOString();
    };
    const lastStocked = (lastStockedAt: string | null) => ({
      'GET /api/pantry/last-stocked': () => Response.json({ lastStockedAt }),
    });
    const lit = (button: HTMLElement) =>
      [...button.querySelectorAll('[data-lamp]')].map(lamp);

    it('lights Expired, Use soon and Running low from the Health To-dos, and names the lit ones', async () => {
      stub(
        {
          batches: [
            batch({ expiryDate: isoIn(-2) }),
            batch({ expiryDate: isoIn(-1) }),
            batch({ expiryDate: isoIn(1) }),
            batch({ ingredientId: 'oil' }),
            ...Array.from({ length: 6 }, () => batch()),
          ],
          runningLow: ['oil'],
        },
        [],
        undefined,
        [],
        lastStocked(daysAgo(1)),
      );

      renderPantryHealth();

      const button = await screen.findByRole('button', {
        name: /^Pantry health: /,
      });
      expect(lit(button)).toEqual([
        'expired:true',
        'soon:true',
        'low:true',
        'fresh:true',
      ]);
      expect(button).toHaveAccessibleName(
        'Pantry health: In good shape, 2 expired, 1 to use soon, 1 running low, new items in.',
      );
    });

    it('shows each lamp count equal to the count in its Health To-do title', async () => {
      stub(
        {
          batches: [
            ...Array.from({ length: 3 }, () =>
              batch({ expiryDate: isoIn(-2) }),
            ),
            ...Array.from({ length: 2 }, () => batch({ expiryDate: isoIn(1) })),
            batch({ ingredientId: 'oil' }),
            batch({ ingredientId: 'salt' }),
            ...Array.from({ length: 3 }, () => batch()),
          ],
          runningLow: ['oil', 'salt'],
        },
        [],
      );
      const user = userEvent.setup();

      renderPantryHealth();
      await user.click(
        await screen.findByRole('button', { name: /^Pantry health: / }),
      );
      const sheet = await screen.findByRole('dialog', {
        name: 'Pantry health',
      });

      const titleCount = (name: RegExp) =>
        Number(
          within(sheet)
            .getByRole('button', { name, expanded: false })
            .textContent?.match(/\d+/)?.[0],
        );
      expect(screen.getByTestId('lamp-count-expired')).toHaveTextContent(
        String(titleCount(/^Toss \d+ expired/)),
      );
      expect(screen.getByTestId('lamp-count-soon')).toHaveTextContent(
        String(titleCount(/^Use \d+ by/)),
      );
      expect(screen.getByTestId('lamp-count-low')).toHaveTextContent(
        String(titleCount(/^Restock \d+ running low/)),
      );
      expect(screen.getByTestId('lamp-count-expired')).toHaveTextContent('3');
      expect(screen.getByTestId('lamp-count-soon')).toHaveTextContent('2');
      expect(screen.getByTestId('lamp-count-low')).toHaveTextContent('2');
    });

    it.each([
      [0, 'fresh:true'],
      [2, 'fresh:true'],
      [5, 'fresh:false'],
      [13, 'fresh:false'],
      [14, 'nothingNew:true'],
    ] as const)(
      'shows the fourth light for a Batch stocked %i days ago as %s',
      async (days, expected) => {
        stub(
          tenBatchPantry(),
          undefined,
          undefined,
          [],
          lastStocked(daysAgo(days)),
        );

        renderPantryHealth();

        const button = await screen.findByRole('button', {
          name: /^Pantry health: /,
        });
        await waitFor(() => expect(lit(button)[3]).toBe(expected));
      },
    );

    it('says how long nothing new came in when the Nothing new light is on', async () => {
      stub(
        tenBatchPantry(),
        undefined,
        undefined,
        [],
        lastStocked(daysAgo(20)),
      );

      renderPantryHealth();

      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /^Pantry health: / }),
        ).toHaveAccessibleName(
          'Pantry health: In good shape, 1 expired, nothing added for 20 days.',
        ),
      );
    });

    it('keeps the fourth light unlit when nothing was ever stocked', async () => {
      stub(tenBatchPantry());

      renderPantryHealth();

      const button = await screen.findByRole('button', {
        name: /^Pantry health: /,
      });
      expect(lit(button)[3]).toBe('fresh:false');
    });
  });

  describe('motion', () => {
    async function changeScore(reduceMotion: boolean) {
      const pantry = tenBatchPantry();
      stub(pantry);
      stubMotion(reduceMotion);
      const { queryClient } = renderWithProviders(<PantryHealthCluster />);
      const button = await screen.findByRole('button', {
        name: /^Pantry health: In good shape/,
      });
      const dial = within(button).getByTestId('health-dial');
      expect(dial).toHaveAttribute('data-angle', angleOf(0.91));
      // Swapping the expired Batch for a dated one lifts Fresh to 100 and Supply to 91 (10 of 11): 30 + 40.95 + 9 + 15 = 94.95, rounded to 95.
      pantry.batches.splice(8, 1);
      pantry.batches.push(batch());
      await queryClient.invalidateQueries({ queryKey: ['pantry'] });
      return button;
    }

    it('turns the needle to the new score over 700 ms', async () => {
      const button = await changeScore(false);

      await waitFor(() =>
        expect(within(button).getByTestId('health-dial')).toHaveAttribute(
          'data-angle',
          angleOf(0.95),
        ),
      );
      const css = authoredCss(within(button).getByTestId('health-needle'));
      expect(css).toContain(`transform ${NEEDLE_TURN_MS}ms`);
      expect(NEEDLE_TURN_MS).toBe(700);
    });

    it('turns the needle at once with reduced motion', async () => {
      const button = await changeScore(true);

      await waitFor(() =>
        expect(within(button).getByTestId('health-dial')).toHaveAttribute(
          'data-angle',
          angleOf(0.95),
        ),
      );
      expect(
        authoredCss(within(button).getByTestId('health-needle')),
      ).toContain('transition:none');
    });

    it('settles the needle and runs the lamp check when the Dashboard appears', async () => {
      stub(tenBatchPantry());
      stubMotion(false);

      renderPantryHealth();

      const button = await screen.findByRole('button', {
        name: /^Pantry health: /,
      });
      expect(button.querySelector('[data-settle="true"]')).not.toBeNull();
      expect(button.querySelectorAll('[data-check="true"]')).toHaveLength(3);
    });

    it('plays neither the settle nor the lamp check with reduced motion', async () => {
      stub(tenBatchPantry());
      stubMotion(true);

      renderPantryHealth();

      const button = await screen.findByRole('button', {
        name: /^Pantry health: /,
      });
      expect(button.querySelector('[data-settle]')).toBeNull();
      expect(button.querySelector('[data-check]')).toBeNull();
    });

    it('cross-fades a lamp over 300 ms, and instantly with reduced motion', async () => {
      stub(tenBatchPantry());
      stubMotion(false);
      const view = renderPantryHealth();
      const button = await screen.findByRole('button', {
        name: /^Pantry health: /,
      });
      const layer = button.querySelector(
        '[data-lamp="expired"] [data-layer="on"]',
      ) as HTMLElement;
      expect(authoredCss(layer)).toContain(`opacity ${LAMP_FADE_MS}ms`);
      expect(LAMP_FADE_MS).toBe(300);
      view.unmount();
      vi.unstubAllGlobals();

      stub(tenBatchPantry());
      stubMotion(true);
      renderPantryHealth();
      const still = await screen.findByRole('button', {
        name: /^Pantry health: /,
      });
      expect(
        authoredCss(
          still.querySelector('[data-lamp="expired"] [data-layer="on"]')!,
        ),
      ).not.toMatch(/\d+ms/);
    });
  });

  describe('sheet', () => {
    it('opens on a tap with the title row and the score: the dial, verdict, n of 100 and each Health Factor bar', async () => {
      stub(tenBatchPantry());
      const user = userEvent.setup();
      renderWithProviders(<PantryHealthCluster />);

      await user.click(
        await screen.findByRole('button', {
          name: /^Pantry health: In good shape/,
        }),
      );

      const sheet = await screen.findByRole('dialog', {
        name: 'Pantry health',
      });
      expect(within(sheet).getByText('In good shape')).toBeInTheDocument();
      expect(within(sheet).getByTestId('health-score')).toHaveTextContent(
        '91 of 100',
      );
      expect(within(sheet).getByTestId('health-dial')).toHaveAttribute(
        'data-angle',
        angleOf(0.91),
      );
      expect(
        [...sheet.querySelectorAll('[data-factor]')].map(
          (row) => row.textContent,
        ),
      ).toEqual(['Fresh89', 'Supply90', 'Dated90', 'Rotation100']);
      expect(
        within(sheet).getByRole('button', { name: 'Close' }),
      ).toBeInTheDocument();
    });

    it('explains the progress instead of the Health Factors under ten Batches', async () => {
      stub({ batches: [batch(), batch()], runningLow: [] }, []);
      const user = userEvent.setup();
      renderWithProviders(<PantryHealthCluster />);

      await user.click(
        await screen.findByRole('button', {
          name: /^Pantry health: Not enough to judge yet/,
        }),
      );

      const sheet = await screen.findByRole('dialog', {
        name: 'Pantry health',
      });
      expect(sheet).toHaveTextContent(
        'Add 8 more to the Pantry to get your score',
      );
      expect(sheet).toHaveTextContent('Not enough to judge yet');
      expect(sheet.querySelector('[data-factor]')).toBeNull();
      expect(within(sheet).getByTestId('health-dial')).toHaveAttribute(
        'data-parked',
        'true',
      );
      expect(sheet).not.toHaveTextContent('of 100');
    });

    it('draws each Health Factor bar to its value in the colour of its band', async () => {
      stub(tenBatchPantry());
      const user = userEvent.setup();
      renderPantryHealth();
      await user.click(
        await screen.findByRole('button', { name: /^Pantry health: / }),
      );
      const sheet = await screen.findByRole('dialog', {
        name: 'Pantry health',
      });

      expect(within(sheet).getByTestId('factor-bar-fresh')).toHaveStyle({
        width: '89%',
      });
      expect(within(sheet).getByTestId('factor-bar-supply')).toHaveStyle({
        width: '90%',
      });
    });

    async function openSheet() {
      stub(tenBatchPantry());
      stubMotion(true);
      const user = userEvent.setup();
      renderWithProviders(<PantryHealthCluster />);
      const card = await screen.findByRole('button', {
        name: /^Pantry health: In good shape/,
      });
      await user.click(card);
      await screen.findByRole('dialog', { name: 'Pantry health' });
      return { user, card };
    }

    const closed = () =>
      waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );

    it('closes on Escape and gives focus back to the cluster', async () => {
      const { user, card } = await openSheet();

      await user.keyboard('{Escape}');

      await closed();
      expect(card).toHaveFocus();
    });

    it('closes on the scrim and gives focus back to the cluster', async () => {
      const { user, card } = await openSheet();

      await user.click(document.querySelector('.MuiBackdrop-root') as Element);

      await closed();
      expect(card).toHaveFocus();
    });

    it('closes on the close button and gives focus back to the cluster', async () => {
      const { user, card } = await openSheet();

      await user.click(screen.getByRole('button', { name: 'Close' }));

      await closed();
      expect(card).toHaveFocus();
    });
  });

  describe('Health To-dos', () => {
    const iso = isoIn;
    /** Twelve Batches: two expired (Milk oldest), two expiring soon, one undated and a missing Staple. */
    function todoPantry() {
      return {
        batches: [
          batch({
            name: 'Yogurt',
            expiryDate: iso(-1),
            quantity: 500,
            unit: 'g',
          }),
          batch({ name: 'Milk', expiryDate: iso(-3), quantity: 1, unit: 'l' }),
          batch({ name: 'Ham', expiryDate: iso(2), location: 'fridge' }),
          batch({ name: 'Cheese', expiryDate: iso(1) }),
          batch({ name: 'Rice', expiryDate: null }),
          ...Array.from({ length: 7 }, () => batch()),
        ],
        runningLow: [] as string[],
      };
    }

    async function openTodos(
      pantry = todoPantry(),
      staples = [staple('eggs')],
    ) {
      const calls = stub(pantry, staples);
      stubMotion(true);
      const user = userEvent.setup();
      const view = renderWithProviders(<PantryHealthCluster />);
      await user.click(
        await screen.findByRole('button', { name: /^Pantry health: / }),
      );
      const sheet = await screen.findByRole('dialog', {
        name: 'Pantry health',
      });
      return { user, sheet, calls, ...view };
    }

    it('groups the Health To-dos as Now, This week and Tidy up with their titles', async () => {
      const { sheet } = await openTodos();

      const headings = within(sheet)
        .getAllByRole('heading')
        .map((heading) => heading.textContent);
      expect(headings).toEqual([
        'Pantry health',
        expect.stringContaining('Now'),
        expect.stringContaining('This week'),
        expect.stringContaining('Tidy up'),
      ]);
      const disclosures = within(sheet)
        .getAllByRole('button', { expanded: false })
        .map((button) => button.textContent);
      expect(disclosures).toEqual([
        expect.stringContaining('Toss 2 expired'),
        expect.stringContaining('Add 1 Staple'),
        expect.stringContaining('Use 2 by '),
        expect.stringContaining('Date 1 Batch'),
      ]);
    });

    it('opens a Health To-do without re-mounting its items, so the transition plays', async () => {
      const { user, sheet } = await openTodos();
      const expired = disclosure(sheet, /^Toss 2 expired/);
      const list = document.getElementById(
        expired.getAttribute('aria-controls') as string,
      );

      await user.click(expired);

      expect(
        document.getElementById(
          expired.getAttribute('aria-controls') as string,
        ),
      ).toBe(list);
    });

    it('names the first three items and the rest as +n', async () => {
      const { sheet } = await openTodos({
        ...todoPantry(),
        batches: [
          ...['A', 'B', 'C', 'D', 'E'].map((name, index) =>
            batch({ name, expiryDate: iso(-1 - index) }),
          ),
          ...Array.from({ length: 6 }, () => batch()),
        ],
      });

      // Oldest first: E (5 days ago), D, C, then +2.
      expect(disclosure(sheet, /^Toss 5 expired/)).toHaveTextContent(
        'E, D, C +2',
      );
    });

    it('opens one Health To-do at a time, listing its Batches', async () => {
      const { user, sheet } = await openTodos();

      const expired = disclosure(sheet, /^Toss 2 expired/);
      expect(expired).toHaveAttribute('aria-expanded', 'false');
      await user.click(expired);

      expect(expired).toHaveAttribute('aria-expanded', 'true');
      const items = document.getElementById(
        expired.getAttribute('aria-controls') as string,
      ) as HTMLElement;
      expect(within(items).getAllByRole('listitem')).toHaveLength(2);

      const soon = disclosure(sheet, /^Use 2 by /);
      await user.click(soon);

      expect(soon).toHaveAttribute('aria-expanded', 'true');
      expect(expired).toHaveAttribute('aria-expanded', 'false');
      expect(within(items).queryByRole('listitem')).not.toBeInTheDocument();
    });
  });

  describe('Health To-do details', () => {
    const iso = isoIn;
    const longAgo = (days: number) => {
      const date = new Date();
      date.setDate(date.getDate() - days);
      return date.toISOString();
    };

    async function open(
      batches: Batch[],
      staples: Staple[] = [],
      runningLow: string[] = [],
    ) {
      stub({ batches, runningLow }, staples);
      stubMotion(true);
      const user = userEvent.setup();
      const view = renderWithProviders(<PantryHealthCluster />);
      await user.click(
        await screen.findByRole('button', { name: /^Pantry health: / }),
      );
      const sheet = await screen.findByRole('dialog', {
        name: 'Pantry health',
      });
      return { user, sheet, ...view };
    }

    const filler = (count: number) =>
      Array.from({ length: count }, () => batch());

    it('writes each item line as the ticket words it', async () => {
      const { user, sheet } = await open(
        [
          batch({
            name: 'Yogurt',
            quantity: 500,
            unit: 'g',
            expiryDate: iso(-2),
          }),
          batch({ name: 'Ham', quantity: 2, unit: 'pcs', expiryDate: iso(2) }),
          batch({
            name: 'Pesto',
            quantity: 190,
            unit: 'g',
            createdAt: longAgo(5),
            expiryDate: null,
          }),
          batch({
            name: 'Peas',
            location: 'freezer',
            createdAt: longAgo(215),
            expiryDate: null,
          }),
          ...filler(6),
        ],
        [{ ...staple('flour'), name: 'Flour', quantity: 1, unit: 'kg' }],
      );

      for (const name of [
        /^Toss 1 expired/,
        /^Add 1 Staple/,
        /^Use 1 by /,
        /^Date 2 Batches/,
      ]) {
        await user.click(
          within(sheet).getByRole('button', { name, expanded: false }),
        );
        await user.click(
          within(sheet).getByRole('button', { name, expanded: true }),
        );
      }
      // Items are mounted closed too, so read all lines from the dialog's text.
      const lines = within(sheet)
        .getAllByRole('listitem', { hidden: true })
        .map((item) => item.textContent);
      expect(lines).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Yogurt500 g · fridge · since \w{3}$/),
          expect.stringContaining('FlourStaple · usual 1 kg · none left'),
          expect.stringMatching(/Ham2 pcs · fridge/),
          expect.stringContaining('Pesto190 g · fridge · 5 d old'),
          expect.stringContaining('Peas7 months in the freezer'),
        ]),
      );
    });

    it('puts the days-left Tag on an Expiring Soon item', async () => {
      const { user, sheet } = await open([
        batch({ name: 'Ham', expiryDate: iso(2) }),
        ...filler(9),
      ]);

      const soon = disclosure(sheet, /^Use 1 by /);
      await user.click(soon);

      expect(itemsOf(soon)[0]).toHaveTextContent('2 d left');
    });

    it('shows Running low items with their amount and Location', async () => {
      const { user, sheet } = await open(
        [
          batch({
            name: 'Milk',
            ingredientId: 'milk',
            quantity: 1,
            unit: 'l',
            location: 'fridge',
          }),
          ...filler(9),
        ],
        [],
        ['milk'],
      );

      const low = disclosure(sheet, /^Restock 1 running low/);
      await user.click(low);

      expect(itemsOf(low)[0]).toHaveTextContent('1 L · fridge');
    });

    it('lists Forgotten Batches before the other undated ones', async () => {
      const { user, sheet } = await open([
        batch({ name: 'Recent', expiryDate: null }),
        batch({ name: 'Forgotten', expiryDate: null, createdAt: longAgo(40) }),
        ...filler(8),
      ]);

      const undated = disclosure(sheet, /^Date 2 Batches/);
      await user.click(undated);

      const names = itemsOf(undated).map((item) => item.textContent);
      expect(names[0]).toContain('Forgotten40 days in the fridge');
      expect(names[1]).toContain('Recent');
    });

    it('shows a gain pill where fixing raises the score, none for Expiring Soon', async () => {
      const { sheet } = await open([
        batch({ expiryDate: iso(-1) }),
        batch({ expiryDate: iso(2) }),
        ...filler(10),
      ]);

      // Fresh 88 and total 95 now; without the expired Batch 96 and 98.
      expect(disclosure(sheet, /^Toss 1 expired/)).toHaveTextContent('+3');
      expect(disclosure(sheet, /^Use 1 by /)).not.toHaveTextContent('+');
    });

    it('shows no gain while the Pantry is not scored, and still lists the Health To-dos', async () => {
      const { sheet } = await open([
        batch({ expiryDate: iso(-1) }),
        ...filler(2),
      ]);

      expect(disclosure(sheet, /^Toss 1 expired/)).not.toHaveTextContent('+');
    });

    it('names the summary after the first Health To-do', async () => {
      stub(tenBatchPantry());
      renderWithProviders(<PantryHealthCluster />);

      expect(
        await screen.findByRole('button', {
          name: /^Pantry health: In good shape/,
        }),
      ).toHaveTextContent('3 to do · Toss 1 expired');
    });

    it('gives each bulk button its full accessible name; Date all is disabled without a Default Expiry', async () => {
      const { sheet } = await open(
        [
          batch({ expiryDate: iso(-1) }),
          batch({ expiryDate: iso(-2) }),
          batch({ expiryDate: iso(2) }),
          batch({ expiryDate: null }),
          ...filler(7),
        ],
        [staple('eggs')],
      );

      expect(
        within(sheet).getByRole('button', { name: 'Toss 2 expired' }),
      ).toBeEnabled();
      expect(
        within(sheet).getByRole('button', { name: 'Add 1 Staple' }),
      ).toBeEnabled();
      expect(
        within(sheet).getByRole('button', { name: 'Date all (1 Batch)' }),
      ).toBeDisabled();
      expect(
        within(sheet).getByRole('link', { name: 'Recipes' }),
      ).toHaveAttribute('href', '/recipes');
    });

    it('opens Recipes from the Expiring Soon Health To-do', async () => {
      stub(
        {
          batches: [batch({ expiryDate: iso(1) }), ...filler(9)],
          runningLow: [],
        },
        [],
      );
      stubMotion(true);
      const user = userEvent.setup();
      renderWithProviders(
        <Routes>
          <Route path="/" element={<PantryHealthCluster />} />
          <Route path="/recipes" element={<p>Recipes page</p>} />
        </Routes>,
      );
      await user.click(
        await screen.findByRole('button', { name: /^Pantry health: / }),
      );

      await user.click(await screen.findByRole('link', { name: 'Recipes' }));

      expect(await screen.findByText('Recipes page')).toBeInTheDocument();
    });

    it('does not list a dismissed missing Staple', async () => {
      stub(tenBatchPantry(), [staple('milk'), staple('eggs')], undefined, [
        'eggs',
      ]);
      stubMotion(true);
      const user = userEvent.setup();
      renderWithProviders(<PantryHealthCluster />);
      await user.click(
        await screen.findByRole('button', { name: /^Pantry health: / }),
      );
      const sheet = await screen.findByRole('dialog', {
        name: 'Pantry health',
      });

      expect(sheet).not.toHaveTextContent(/Add \d+ Staple/);
      expect(sheet).not.toHaveTextContent('eggs');
      expect(sheet).toHaveTextContent('Staples covered');
    });

    it('shows a done pill for each Health To-do with nothing to do', async () => {
      const { sheet } = await open([
        batch({ expiryDate: iso(-1) }),
        ...filler(9),
      ]);

      const pills = within(sheet)
        .getAllByRole('listitem')
        .map((item) => item.textContent);
      expect(pills).toEqual(
        expect.arrayContaining([
          'Staples covered',
          'Nothing due soon',
          'Nothing low',
          'All dated',
          'Nothing forgotten',
        ]),
      );
      expect(pills).not.toContain('Nothing expired');
    });

    it('drops the Nothing forgotten pill while a Batch is Forgotten', async () => {
      const { sheet } = await open([
        batch({ expiryDate: null, createdAt: longAgo(40) }),
        ...filler(9),
      ]);

      const pills = within(sheet)
        .getAllByRole('listitem')
        .map((item) => item.textContent);
      expect(pills).not.toContain('Nothing forgotten');
    });

    it('says all done, with every pill, when there is nothing to do', async () => {
      const { sheet } = await open(filler(10));

      expect(sheet).toHaveTextContent('Nothing to do.');
      expect(within(sheet).getAllByRole('listitem')).toHaveLength(6);
    });

    it('keeps the open Health To-do open when the data changes', async () => {
      const pantry = {
        batches: [
          batch({ name: 'Milk', expiryDate: iso(-1) }),
          batch({ name: 'Ham', expiryDate: iso(-2) }),
          ...filler(10),
        ],
        runningLow: [] as string[],
      };
      stub(pantry, []);
      stubMotion(true);
      const user = userEvent.setup();
      const { queryClient } = renderWithProviders(<PantryHealthCluster />);
      await user.click(
        await screen.findByRole('button', { name: /^Pantry health: / }),
      );
      const sheet = await screen.findByRole('dialog', {
        name: 'Pantry health',
      });
      await user.click(disclosure(sheet, /^Toss 2 expired/));

      pantry.batches.splice(1, 1);
      await queryClient.invalidateQueries({ queryKey: ['pantry'] });

      const expired = await within(sheet).findByRole('button', {
        name: /^Toss 1 expired/,
        expanded: true,
      });
      expect(expired).toBeInTheDocument();
    });
  });

  describe('adding to the Shopping List', () => {
    type Line = {
      id: string;
      ingredientId: string;
      quantity?: number;
      unit?: string;
    };

    /** A Shopping List the stubbed API keeps: bulk-add appends (ids in request order), delete removes. */
    function shoppingApi() {
      const lines: Line[] = [];
      let next = 0;
      const view = () => ({
        id: 'l1',
        groups: [
          {
            aisle: null,
            items: lines.map((line) => ({
              ...line,
              name: line.ingredientId,
              quantity: line.quantity ?? null,
              unit: line.unit ?? null,
              checked: false,
              unmatched: false,
            })),
          },
        ],
        summary: { remaining: lines.length, checked: 0 },
      });
      const deleted: string[] = [];
      let gate: Promise<void> = Promise.resolve();
      const routes: Record<string, () => Response> = {
        'GET /api/shopping-list': () => Response.json(view()),
      };
      return {
        lines,
        deleted,
        routes,
        /** Holds the bulk-add response until the returned release is called. */
        holdAdd: () => {
          let release = () => {};
          gate = new Promise<void>((resolve) => {
            release = resolve;
          });
          return release;
        },
        waitForGate: () => gate,
        /**
         * Adds the lines a bulk-add request names (an Ingredient already on the list is merged into) and
         * answers with the list, the ids created or merged into, and the ids newly inserted.
         */
        add: (items: Array<Omit<Line, 'id'>>) => {
          const insertedIds: string[] = [];
          const createdIds = items.map((item) => {
            const existing = lines.find(
              (line) => line.ingredientId === item.ingredientId,
            );
            if (existing) return existing.id;
            next += 1;
            lines.push({ id: `sh${next}`, ...item });
            insertedIds.push(`sh${next}`);
            return `sh${next}`;
          });
          return Response.json({ ...view(), createdIds, insertedIds });
        },
        remove: (id: string) => {
          const at = lines.findIndex((line) => line.id === id);
          if (at >= 0) lines.splice(at, 1);
          deleted.push(id);
          return Response.json(view());
        },
      };
    }

    async function openWith(
      batches: Batch[],
      staples: Staple[],
      runningLow: string[] = [],
    ) {
      const shopping = shoppingApi();
      const calls = stub({ batches, runningLow }, staples, undefined, [], {
        ...shopping.routes,
        'POST /api/shopping-list/items/bulk': async () => {
          await shopping.waitForGate();
          const { body } = calls
            .filter((call) => call.key === 'POST /api/shopping-list/items/bulk')
            .at(-1) as { body: { items: Array<Omit<Line, 'id'>> } };
          return shopping.add(body.items);
        },
        'DELETE /api/shopping-list/items/sh1': () => shopping.remove('sh1'),
        'DELETE /api/shopping-list/items/sh2': () => shopping.remove('sh2'),
        'DELETE /api/shopping-list/items/sh3': () => shopping.remove('sh3'),
      });
      stubMotion(true);
      const user = userEvent.setup();
      renderWithProviders(<PantryHealthCluster />);
      await user.click(
        await screen.findByRole('button', { name: /^Pantry health: / }),
      );
      const sheet = await screen.findByRole('dialog', {
        name: 'Pantry health',
      });
      const posts = () =>
        calls
          .filter((call) => call.key === 'POST /api/shopping-list/items/bulk')
          .map((call) => call.body);
      return { user, sheet, shopping, posts, calls };
    }

    const filler = (count: number) =>
      Array.from({ length: count }, () => batch());
    const flour = {
      ...staple('flour'),
      name: 'Flour',
      quantity: 1,
      unit: 'kg' as const,
    };
    const salt = { ...staple('salt'), name: 'Salt' };

    it('adds every missing Staple with its preferred amount, and the Health To-do drops out', async () => {
      const { user, sheet, posts } = await openWith(filler(10), [flour, salt]);

      await user.click(
        within(sheet).getByRole('button', { name: 'Add 2 Staples' }),
      );

      expect(posts()).toEqual([
        {
          items: [
            { ingredientId: 'flour', quantity: 1, unit: 'kg' },
            { ingredientId: 'salt' },
          ],
        },
      ]);
      await waitFor(() =>
        expect(sheet).not.toHaveTextContent(/Add \d+ Staples/),
      );
      expect(sheet).toHaveTextContent('Staples covered');
    });

    it('announces the count and the new score in a toast', async () => {
      const { user, sheet } = await openWith(filler(10), [flour, salt]);

      await user.click(
        within(sheet).getByRole('button', { name: 'Add 2 Staples' }),
      );

      // Supply goes from 10 of 12 to 11 of 12 (92): 30 + 41.4 + 10 + 15 = 96.4, from 92.
      expect(
        await screen.findByText('2 added to the Shopping List · score 96'),
      ).toBeInTheDocument();
      expect(politeToast('2 added to the Shopping List · score 96')).toBe(true);
    });

    it('adds a single Staple from its row with a plus button', async () => {
      const { user, sheet, posts } = await openWith(filler(10), [flour, salt]);
      await user.click(disclosure(sheet, /^Add 2 Staples/));

      await user.click(
        within(sheet).getByRole('button', { name: 'Add Flour' }),
      );

      expect(posts()).toEqual([
        { items: [{ ingredientId: 'flour', quantity: 1, unit: 'kg' }] },
      ]);
      await waitFor(() =>
        expect(
          within(sheet).queryByRole('button', { name: 'Add Flour' }),
        ).not.toBeInTheDocument(),
      );
      expect(
        within(sheet).getByRole('button', { name: 'Add 1 Staple' }),
      ).toBeInTheDocument();
    });

    it('adds the Running low Ingredients, one at a time or together, without an amount', async () => {
      const { user, sheet, posts } = await openWith(
        [
          batch({ name: 'Milk', ingredientId: 'milk' }),
          batch({ name: 'Eggs', ingredientId: 'eggs' }),
          ...filler(8),
        ],
        [],
        ['milk', 'eggs'],
      );
      await user.click(disclosure(sheet, /^Restock 2 running low/));

      await user.click(within(sheet).getByRole('button', { name: 'Add Milk' }));
      await waitFor(() =>
        expect(
          within(sheet).queryByRole('button', { name: 'Add Milk' }),
        ).not.toBeInTheDocument(),
      );
      await user.click(
        within(sheet).getByRole('button', { name: 'Add 1 running low' }),
      );

      expect(posts()).toEqual([
        { items: [{ ingredientId: 'milk' }] },
        { items: [{ ingredientId: 'eggs' }] },
      ]);
    });

    it('undoes exactly the Shopping Items the add returned, leaving others alone', async () => {
      const { user, sheet, shopping } = await openWith(filler(10), [
        flour,
        salt,
      ]);
      shopping.lines.push({ id: 'sh0', ingredientId: 'butter' });
      await user.click(
        within(sheet).getByRole('button', { name: 'Add 2 Staples' }),
      );
      await screen.findByText(/^2 added to the Shopping List/);

      await user.click(screen.getByRole('button', { name: 'Undo' }));

      await waitFor(() => expect(shopping.deleted).toEqual(['sh1', 'sh2']));
      expect(shopping.lines.map((line) => line.id)).toEqual(['sh0']);
      expect(
        await within(sheet).findByRole('button', { name: 'Add 2 Staples' }),
      ).toBeInTheDocument();
    });

    it('does not delete a line the add only merged into when undoing', async () => {
      const { user, sheet, shopping } = await openWith(filler(10), [
        flour,
        salt,
      ]);
      shopping.lines.push({ id: 'sh0', ingredientId: 'flour' });
      await user.click(
        within(sheet).getByRole('button', { name: 'Add 2 Staples' }),
      );
      await screen.findByText(/^2 added to the Shopping List/);

      await user.click(screen.getByRole('button', { name: 'Undo' }));

      await waitFor(() => expect(shopping.deleted).toEqual(['sh1']));
      expect(shopping.lines.map((line) => line.id)).toEqual(['sh0']);
    });

    it('offers no Undo when everything merged into lines already on the list', async () => {
      const { user, sheet, shopping } = await openWith(filler(10), [
        flour,
        salt,
      ]);
      shopping.lines.push(
        { id: 'sh0', ingredientId: 'flour' },
        { id: 'sh9', ingredientId: 'salt' },
      );
      await user.click(
        within(sheet).getByRole('button', { name: 'Add 2 Staples' }),
      );

      const toast = await screen.findByText(/^2 added to the Shopping List/);
      expect(toast).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
      // A toast without Undo is still a polite live region, not an alert.
      expect(toast.closest('[role="status"]')).not.toBeNull();
    });

    it('still shows the toast when the sheet is closed before the add answers', async () => {
      const { user, sheet, shopping } = await openWith(filler(10), [
        flour,
        salt,
      ]);
      const release = shopping.holdAdd();
      await user.click(
        within(sheet).getByRole('button', { name: 'Add 2 Staples' }),
      );

      await user.click(within(sheet).getByRole('button', { name: 'Close' }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      release();

      expect(
        await screen.findByText(/^2 added to the Shopping List/),
      ).toBeInTheDocument();
    });
  });

  describe('Toss and Used', () => {
    const iso = isoIn;
    const longAgo = (days: number) => {
      const date = new Date();
      date.setDate(date.getDate() - days);
      return date.toISOString();
    };
    /** Twelve Batches: Yogurt and Milk expired, Ham and Cheese expiring soon, Rice undated and Forgotten, a missing Staple. */
    function pantry() {
      return {
        batches: [
          batch({ id: 'yogurt', name: 'Yogurt', expiryDate: iso(-1) }),
          batch({ id: 'milk', name: 'Milk', expiryDate: iso(-3) }),
          batch({ id: 'ham', name: 'Ham', expiryDate: iso(2) }),
          batch({ id: 'cheese', name: 'Cheese', expiryDate: iso(1) }),
          batch({
            id: 'rice',
            name: 'Rice',
            expiryDate: null,
            createdAt: longAgo(40),
          }),
          ...Array.from({ length: 7 }, () => batch()),
        ],
        runningLow: [] as string[],
      };
    }

    /** The sheet open on the given Health To-do, with bulk delete stubbed. */
    async function openTodo(name: RegExp) {
      const calls = stub(pantry(), [staple('eggs')], undefined, [], {
        'POST /api/pantry/batches/bulk-delete': async () => {
          return new Response(null, { status: 204 });
        },
      });
      stubMotion(true);
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderWithProviders(<PantryHealthCluster />);
      await user.click(
        await screen.findByRole('button', { name: /^Pantry health: / }),
      );
      const sheet = await screen.findByRole('dialog', {
        name: 'Pantry health',
      });
      await user.click(disclosure(sheet, name));
      return { user, sheet, calls };
    }
    const afterWindow = () => act(() => vi.advanceTimersByTimeAsync(5200));
    const bulkDeletes = (calls: ReturnType<typeof stub>) =>
      calls.filter(
        (call) => call.key === 'POST /api/pantry/batches/bulk-delete',
      );

    afterEach(() => vi.useRealTimers());

    it('tosses every expired Batch with the primary button: rows go, the toast gives the new score, one request follows the window', async () => {
      const { user, sheet, calls } = await openTodo(/^Toss 2 expired/);

      const toss = within(sheet).getByRole('button', {
        name: 'Toss 2 expired',
      });
      await user.click(toss);

      expect(
        within(sheet).queryByRole('button', { name: /^Toss 2 expired/ }),
      ).not.toBeInTheDocument();
      expect(
        await screen.findByText('Removed 2 expired · score 91'),
      ).toBeInTheDocument();
      expect(politeToast('Removed 2 expired · score 91')).toBe(true);
      expect(bulkDeletes(calls)).toHaveLength(0);

      await afterWindow();

      expect(bulkDeletes(calls)).toEqual([
        expect.objectContaining({ body: { ids: ['milk', 'yogurt'] } }),
      ]);
    });

    it('brings the rows back on Undo and sends nothing', async () => {
      const { user, sheet, calls } = await openTodo(/^Toss 2 expired/);

      await user.click(
        within(sheet).getByRole('button', { name: 'Toss 2 expired' }),
      );
      await user.click(await screen.findByRole('button', { name: 'Undo' }));
      await afterWindow();

      expect(
        within(sheet).getByRole('button', { name: 'Toss 2 expired' }),
      ).toBeInTheDocument();
      expect(bulkDeletes(calls)).toHaveLength(0);
      expect(calls.some((call) => call.key.startsWith('DELETE'))).toBe(false);
    });

    it('tosses a single expired Batch from its row with "Toss {name}"', async () => {
      const { user, sheet, calls } = await openTodo(/^Toss 2 expired/);

      await user.click(
        within(sheet).getByRole('button', { name: 'Toss Milk' }),
      );

      expect(
        await screen.findByText('Tossed Milk · score 88'),
      ).toBeInTheDocument();
      expect(within(sheet).queryByText('Milk')).not.toBeInTheDocument();
      expect(
        within(sheet).getByRole('button', { name: 'Toss Yogurt' }),
      ).toBeInTheDocument();

      await afterWindow();

      expect(bulkDeletes(calls)).toEqual([
        expect.objectContaining({ body: { ids: ['milk'] } }),
      ]);
    });

    it('tosses a Forgotten Batch from the Date to-do', async () => {
      const { user, sheet, calls } = await openTodo(/^Date 1 Batch/);

      await user.click(
        within(sheet).getByRole('button', { name: 'Toss Rice' }),
      );

      expect(
        await screen.findByText('Tossed Rice · score 88'),
      ).toBeInTheDocument();
      await afterWindow();
      expect(bulkDeletes(calls)).toEqual([
        expect.objectContaining({ body: { ids: ['rice'] } }),
      ]);
    });

    it('marks an Expiring Soon Batch as Used, and undoing it sends nothing', async () => {
      const { user, sheet, calls } = await openTodo(/^Use 2 by /);

      await user.click(within(sheet).getByRole('button', { name: 'Used Ham' }));

      expect(
        await screen.findByText('Used Ham · score 86'),
      ).toBeInTheDocument();
      expect(within(sheet).queryByText('Ham')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Undo' }));
      await afterWindow();

      expect(within(sheet).getByText('Ham')).toBeInTheDocument();
      expect(bulkDeletes(calls)).toHaveLength(0);

      await user.click(within(sheet).getByRole('button', { name: 'Used Ham' }));
      await afterWindow();
      expect(bulkDeletes(calls)).toEqual([
        expect.objectContaining({ body: { ids: ['ham'] } }),
      ]);
    });

    it('does not offer Toss on Expiring Soon items or Used on Expired ones', async () => {
      const { sheet } = await openTodo(/^Use 2 by /);

      expect(
        within(sheet).queryByRole('button', { name: /^Toss (Ham|Cheese)/ }),
      ).not.toBeInTheDocument();
      expect(
        within(sheet).queryByRole('button', { name: /^Used (Yogurt|Milk)/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe('dating Batches', () => {
    const daysAgo = (days: number) => {
      const date = new Date();
      date.setDate(date.getDate() - days);
      return date.toISOString();
    };
    const pesto = () =>
      batch({
        id: 'pesto',
        name: 'Pesto',
        quantity: 190,
        unit: 'g',
        expiryDate: null,
        defaultExpiryDays: 30,
        createdAt: daysAgo(5),
      });
    const jam = () =>
      batch({
        id: 'jam',
        name: 'Jam',
        location: 'cupboard',
        expiryDate: null,
        defaultExpiryDays: 365,
        // Added 400 days ago: its usual date, 35 days ago, has passed.
        createdAt: daysAgo(400),
      });
    const mystery = () =>
      batch({
        id: 'mystery',
        name: 'Mystery jar',
        ingredientId: null,
        unmatched: true,
        expiryDate: null,
        defaultExpiryDays: null,
      });

    /** A Pantry the stubbed API keeps: a PATCH changes the Batch's expiry date. */
    async function openWith(batches: Batch[], failing: string[] = []) {
      const pantry = batches.map((b) => ({ ...b }));
      const patches: Array<{ id: string; expiryDate: unknown }> = [];
      const patchRoute = (id: string) => async (url: URL) => {
        void url;
        if (failing.includes(id))
          return Response.json({ message: 'boom' }, { status: 500 });
        const { body } = calls
          .filter((call) => call.key === `PATCH /api/pantry/batches/${id}`)
          .at(-1) as { body: { expiryDate: string | null } };
        patches.push({ id, expiryDate: body.expiryDate });
        const target = pantry.find((b) => b.id === id) as Batch;
        target.expiryDate = body.expiryDate;
        return Response.json(target);
      };
      const calls = stub({ batches: [], runningLow: [] }, [], undefined, [], {
        'GET /api/pantry': () =>
          Response.json({ batches: pantry, runningLow: [] }),
        ...Object.fromEntries(
          batches.map((b) => [
            `PATCH /api/pantry/batches/${b.id}`,
            patchRoute(b.id),
          ]),
        ),
      });
      stubMotion(true);
      const user = userEvent.setup();
      renderWithProviders(<PantryHealthCluster />);
      await user.click(
        await screen.findByRole('button', { name: /^Pantry health: / }),
      );
      const sheet = await screen.findByRole('dialog', {
        name: 'Pantry health',
      });
      return { user, sheet, patches, pantry };
    }

    const filler = (count: number) =>
      Array.from({ length: count }, () => batch());

    it('opens the expiry sheet for one Batch with its context and the usual date pre-selected, and saves it', async () => {
      const { user, sheet, patches } = await openWith([pesto(), ...filler(9)]);
      await user.click(
        within(sheet).getByRole('button', { name: /^Date 1 Batch/ }),
      );

      await user.click(
        within(sheet).getByRole('button', { name: 'Set date for Pesto' }),
      );

      const picker = await screen.findByRole('dialog', { name: 'Expires' });
      expect(within(picker).getByText('Pesto · 190 g · Fridge')).toBeVisible();
      expect(
        within(picker).getByRole('button', { name: /^Usual, /, pressed: true }),
      ).toBeInTheDocument();

      await user.click(within(picker).getByRole('button', { name: 'Done' }));

      await waitFor(() =>
        expect(patches).toEqual([{ id: 'pesto', expiryDate: isoIn(30) }]),
      );
      expect(await screen.findByText(/^Pesto dated/)).toBeInTheDocument();
      await waitFor(() =>
        expect(
          within(sheet).queryByRole('button', { name: /^Date 1 Batch/ }),
        ).not.toBeInTheDocument(),
      );
    });

    it('puts the previous date back on Undo after Set date', async () => {
      const { user, sheet, patches } = await openWith([pesto(), ...filler(9)]);
      await user.click(
        within(sheet).getByRole('button', { name: /^Date 1 Batch/ }),
      );
      await user.click(
        within(sheet).getByRole('button', { name: 'Set date for Pesto' }),
      );
      const picker = await screen.findByRole('dialog', { name: 'Expires' });
      await user.click(within(picker).getByRole('button', { name: 'Done' }));
      await screen.findByText(/^Pesto dated/);

      await user.click(screen.getByRole('button', { name: 'Undo' }));

      await waitFor(() =>
        expect(patches.at(-1)).toEqual({ id: 'pesto', expiryDate: null }),
      );
      expect(
        await within(sheet).findByRole('button', { name: /^Date 1 Batch/ }),
      ).toBeInTheDocument();
    });

    it('saves nothing when the Batch is closed with no expiry', async () => {
      const { user, sheet, patches } = await openWith([pesto(), ...filler(9)]);
      await user.click(
        within(sheet).getByRole('button', { name: /^Date 1 Batch/ }),
      );
      await user.click(
        within(sheet).getByRole('button', { name: 'Set date for Pesto' }),
      );
      const picker = await screen.findByRole('dialog', { name: 'Expires' });
      await user.click(
        within(picker).getByRole('button', { name: 'No expiry' }),
      );
      await user.click(within(picker).getByRole('button', { name: 'Done' }));

      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Expires' }),
        ).not.toBeInTheDocument(),
      );
      expect(patches).toEqual([]);
    });

    it('dates only the Batches that have a Default Expiry, leaving the others listed', async () => {
      const { user, sheet, patches } = await openWith([
        pesto(),
        jam(),
        mystery(),
        ...filler(7),
      ]);

      await user.click(
        within(sheet).getByRole('button', { name: 'Date all 3 Batches' }),
      );

      await waitFor(() =>
        expect(patches).toEqual(
          expect.arrayContaining([
            // Added 5 days ago plus 30 days; and 365 days from today, since its own date has passed.
            { id: 'pesto', expiryDate: isoIn(25) },
            { id: 'jam', expiryDate: isoIn(365) },
          ]),
        ),
      );
      expect(patches).toHaveLength(2);
      expect(
        await screen.findByText(
          /^2 given their usual expiry · edit any in Pantry/,
        ),
      ).toBeInTheDocument();
      expect(politeToast(/^2 given their usual expiry/)).toBe(true);
      const remaining = await within(sheet).findByRole('button', {
        name: /^Date 1 Batch/,
      });
      await user.click(remaining);
      expect(
        within(sheet).getByRole('button', { name: 'Set date for Mystery jar' }),
      ).toBeInTheDocument();
    });

    it('says some dates did not save', async () => {
      const { user, sheet, patches } = await openWith(
        [pesto(), jam(), ...filler(8)],
        ['jam'],
      );

      await user.click(
        within(sheet).getByRole('button', { name: 'Date all 2 Batches' }),
      );

      expect(
        await screen.findByText(
          /^1 given their usual expiry.*· 1 date could not be saved/,
        ),
      ).toBeInTheDocument();
      expect(patches).toEqual([{ id: 'pesto', expiryDate: isoIn(25) }]);
    });

    it('puts every date back on Undo after Date all', async () => {
      const { user, sheet, patches, pantry } = await openWith([
        pesto(),
        jam(),
        mystery(),
        ...filler(7),
      ]);
      await user.click(
        within(sheet).getByRole('button', { name: 'Date all 3 Batches' }),
      );
      await screen.findByText(/^2 given their usual expiry/);

      await user.click(screen.getByRole('button', { name: 'Undo' }));

      await waitFor(() => expect(patches).toHaveLength(4));
      expect(patches.slice(2)).toEqual(
        expect.arrayContaining([
          { id: 'pesto', expiryDate: null },
          { id: 'jam', expiryDate: null },
        ]),
      );
      expect(pantry.filter((b) => b.expiryDate === null)).toHaveLength(3);
      expect(
        await within(sheet).findByRole('button', {
          name: 'Date all 3 Batches',
        }),
      ).toBeEnabled();
    });

    it('cannot Date all when no Batch has a Default Expiry', async () => {
      const { sheet } = await openWith([mystery(), ...filler(9)]);

      expect(
        within(sheet).getByRole('button', { name: 'Date all (1 Batch)' }),
      ).toBeDisabled();
    });
  });

  describe.each(['light', 'dark'] as const)('in the %s Theme', (theme) => {
    // The open sheet prints dates ("since Tue"); a fixed day keeps the snapshots stable.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-15T12:00:00'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    async function render() {
      localStorage.setItem(
        'pp.appearance',
        JSON.stringify({ theme, matchSystem: false }),
      );
      stub(tenBatchPantry(), undefined, undefined, [], {
        'GET /api/pantry/last-stocked': () =>
          Response.json({ lastStockedAt: '2026-10-14T09:00:00' }),
      });
      stubMotion(true);
      const result = renderPantryHealth();
      const button = await screen.findByRole('button', {
        name: /^Pantry health: In good shape/,
      });
      return { ...result, button };
    }

    it('looks the same in the header', async () => {
      const { button } = await render();
      expect(snapshotOf(button)).toMatchSnapshot();
    });

    it('looks the same as an open sheet', async () => {
      const { button } = await render();
      await userEvent.setup().click(button);
      const sheet = await screen.findByRole('dialog', {
        name: 'Pantry health',
      });
      expect(snapshotOf(sheet)).toMatchSnapshot();
    });
  });
});

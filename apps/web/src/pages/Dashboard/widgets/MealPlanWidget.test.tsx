import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DayStatus,
  Mealtime,
  MealWindow,
  PlanIssue,
  PlanTag,
  SlotStatus,
  WindowDay,
  WindowSlot,
} from '../../../lib/mealPlan';
import { renderWithProviders, stubApi } from '../../../test/render';
import { stubViewport } from '../../../test/viewport';
import { MealPlanWidget } from './MealPlanWidget';

/** Thursday 15 October 2026. */
const NOW = new Date(2026, 9, 15, 12, 0, 0);
const iso = (offset: number) => {
  const date = new Date(NOW);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

type Meal = {
  mealtime?: Mealtime;
  title?: string;
  status?: SlotStatus;
  issues?: PlanIssue[];
  minutes?: number | null;
  unavailable?: boolean;
  allergyWarning?: WindowSlot['allergyWarning'];
};

const slot = (offset: number, meal: Meal): WindowSlot => ({
  dayIndex: offset,
  date: iso(offset),
  mealtime: meal.mealtime ?? 'dinner',
  planId: 'p1',
  recipeId: `r-${offset}-${meal.mealtime ?? 'dinner'}`,
  recipeTitle: meal.title ?? 'Lemon pasta',
  servings: 2,
  servingsOverride: null,
  unavailable: meal.unavailable ?? meal.status === 'unavailable',
  minutes: meal.minutes === undefined ? 25 : meal.minutes,
  allergyWarning: meal.allergyWarning ?? null,
  aisle: null,
  status: meal.status ?? 'covered',
  issues: meal.issues ?? [],
});

const WORST: SlotStatus[] = ['short', 'onList', 'covered', 'unavailable'];

/** A planned day; its status is the worst of its meals, as the API works it out. */
const day = (
  offset: number,
  meals: Meal[] = [{}],
  over: Partial<WindowDay> = {},
): WindowDay => {
  const slots = meals.map((meal) => slot(offset, meal));
  const status: DayStatus =
    WORST.find((s) => slots.some((sl) => sl.status === s)) ?? 'empty';
  return { date: iso(offset), status, planId: 'p1', slots, ...over };
};

const gap = (offset: number): WindowDay =>
  day(offset, [], { status: 'empty', planId: null });

const issue = (over: Partial<PlanIssue> = {}): PlanIssue => ({
  ingredientId: 'eggs',
  name: 'Eggs',
  kind: 'short',
  quantity: 2,
  unit: 'pcs',
  onList: false,
  reason: { code: 'notInPantry' },
  ...over,
});

const windowOf = (
  days: WindowDay[],
  over: Partial<MealWindow> = {},
): MealWindow => ({
  today: iso(0),
  days,
  tag: { kind: 'allCovered' },
  plan: null,
  nextPlanStart: null,
  nextPlanId: null,
  missing: [],
  ...over,
});

function stub(view: MealWindow | (() => MealWindow)) {
  const { fetchMock, calls } = stubApi({
    'GET /api/meal-plans/window': () =>
      Response.json(typeof view === 'function' ? view() : view),
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const week = (n: number, meals?: Meal[]) =>
  Array.from({ length: n }, (_, offset) => day(offset, meals));

const columns = () =>
  screen
    .getAllByRole('button', { expanded: false })
    .filter((button) => button.hasAttribute('aria-haspopup'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  stubViewport(390);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

const renderWidget = (locale: 'en' | 'ro' | 'da' = 'en') =>
  renderWithProviders(<MealPlanWidget size="wide" columns={2} />, { locale });

describe('MealPlanWidget week columns', () => {
  it.each([1, 3, 7])('shows one column per planned day (%i)', async (n) => {
    stub(windowOf(week(n)));
    renderWidget();

    await screen.findAllByRole('button', { name: /meal/ });
    expect(columns()).toHaveLength(n);
    expect(screen.getByRole('region', { name: 'Meal plan' })).toHaveTextContent(
      `Meal plan · ${n} day${n === 1 ? '' : 's'}`,
    );
  });

  it('shows the Dinner title under the bars with 3 days or fewer, and no titles with more', async () => {
    stub(
      windowOf([
        day(0, [
          { mealtime: 'breakfast', title: 'Porridge' },
          { mealtime: 'dinner', title: 'Lemon pasta' },
        ]),
        day(1, [{ mealtime: 'lunch', title: 'Leek soup' }]),
        day(2, [], { status: 'empty' }),
      ]),
    );
    renderWidget();

    expect(await screen.findByText('Lemon pasta')).toBeInTheDocument();
    expect(screen.queryByText('Porridge')).not.toBeInTheDocument();
    expect(screen.getByText('Leek soup')).toBeInTheDocument();
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
  });

  it('hides the titles at 4 days', async () => {
    stub(windowOf(week(4)));
    renderWidget();

    await screen.findAllByRole('button', { name: /meal/ });
    expect(screen.queryByText('Lemon pasta')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing yet')).not.toBeInTheDocument();
  });

  it('names each column in full for a screen reader', async () => {
    stub(
      windowOf([
        day(0, [
          { mealtime: 'lunch', status: 'covered' },
          { mealtime: 'dinner', status: 'short' },
        ]),
        day(1, [{ status: 'onList' }]),
        day(2, [{ status: 'unavailable' }]),
        gap(3),
        day(4, [{ status: 'covered' }]),
      ]),
    );
    renderWidget();

    expect(
      await screen.findByRole('button', {
        name: 'Thursday 15 October: 2 meals, short',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Friday 16 October: 1 meal, on list',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Saturday 17 October: 1 meal unavailable',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Sunday 18 October: nothing planned',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Monday 19 October: 1 meal, covered',
      }),
    ).toBeInTheDocument();
  });

  it('hides the bars, marks and legend from screen readers', async () => {
    stub(windowOf(week(2)));
    renderWidget();

    const [first] = await screen.findAllByRole('button', { name: /meal/ });
    for (const hidden of first.querySelectorAll('[data-bar], [data-mark]')) {
      expect(hidden.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    expect(
      screen.getByText('Bars: B · L · D').closest('[aria-hidden]'),
    ).toHaveAttribute('aria-hidden', 'true');
  });

  it('counts only the available meals in a column name, then the unavailable ones', async () => {
    stub(
      windowOf([
        day(0, [
          { mealtime: 'lunch', status: 'covered' },
          { mealtime: 'dinner', status: 'unavailable' },
        ]),
      ]),
    );
    renderWidget();

    expect(
      await screen.findByRole('button', {
        name: 'Thursday 15 October: 1 meal, covered, 1 unavailable',
      }),
    ).toBeInTheDocument();
  });

  it('marks today with aria-current rather than in its name', async () => {
    stub(windowOf(week(2)));
    renderWidget();

    const today = await screen.findByRole('button', {
      name: /^Thursday 15 October/,
    });
    expect(today).toHaveAttribute('aria-current', 'date');
  });

  it('colours each bar by its meal: covered, short, on list, unavailable, empty', async () => {
    stub(
      windowOf([
        day(0, [
          { mealtime: 'breakfast', status: 'covered' },
          { mealtime: 'lunch', status: 'short' },
          { mealtime: 'dinner', status: 'onList' },
        ]),
        day(1, [{ mealtime: 'dinner', status: 'unavailable' }]),
      ]),
    );
    renderWidget();

    const [today, tomorrow] = await screen.findAllByRole('button', {
      name: /meal/,
    });
    const bars = (column: HTMLElement) =>
      [...column.querySelectorAll('[data-bar]')].map((bar) =>
        bar.getAttribute('data-bar'),
      );
    expect(bars(today)).toEqual(['covered', 'short', 'onList']);
    expect(bars(tomorrow)).toEqual(['empty', 'empty', 'unavailable']);
  });

  it('marks the day: a check, a bang, a count, a basket, or an empty ring', async () => {
    stub(
      windowOf([
        day(0, [{ status: 'covered' }]),
        day(1, [{ status: 'short' }]),
        day(2, [
          { mealtime: 'breakfast', status: 'short' },
          { mealtime: 'lunch', status: 'short' },
          { mealtime: 'dinner', status: 'covered' },
        ]),
        day(3, [{ status: 'onList' }]),
        gap(4),
      ]),
    );
    renderWidget();

    await screen.findAllByRole('button', { name: /meal|nothing/ });
    const marks = [...document.querySelectorAll('[data-mark]')].map((mark) => [
      mark.getAttribute('data-mark'),
      mark.textContent,
    ]);
    expect(marks).toEqual([
      ['covered', ''],
      ['short', ''],
      ['short', '2'],
      ['onList', ''],
      ['empty', ''],
    ]);
  });

  it('highlights today and no other column', async () => {
    stub(windowOf(week(3)));
    renderWidget();

    await screen.findAllByRole('button', { name: /meal/ });
    expect(
      columns().map((column) => column.getAttribute('aria-current')),
    ).toEqual(['date', null, null]);
    expect(columns()[0]).toHaveTextContent('Today');
  });

  it('shows a gap day between plans as nothing planned', async () => {
    stub(windowOf([day(0), gap(1), day(2)]));
    renderWidget();

    expect(
      await screen.findByRole('button', {
        name: 'Friday 16 October: nothing planned',
      }),
    ).toBeInTheDocument();
    expect(columns()).toHaveLength(3);
  });
});

describe('MealPlanWidget header', () => {
  it.each<[PlanTag, string]>([
    [{ kind: 'short', count: 1 }, '1 meal short'],
    [{ kind: 'short', count: 3 }, '3 meals short'],
    [{ kind: 'coveredOnceYouShop' }, 'Covered once you shop'],
    [{ kind: 'allCovered' }, 'All covered'],
  ])('shows the plan tag %j as "%s"', async (tag, text) => {
    stub(windowOf(week(2), { tag }));
    renderWidget();

    const region = await screen.findByRole('region', { name: 'Meal plan' });
    await waitFor(() => expect(region).toHaveTextContent(text));
  });

  it('links the header to the Meal plans page', async () => {
    stub(windowOf(week(2)));
    renderWidget();

    await screen.findAllByRole('button', { name: /meal/ });
    expect(screen.getByRole('link', { name: /Meal plan/ })).toHaveAttribute(
      'href',
      '/meal-plans',
    );
    expect(
      screen.queryByRole('button', { name: /Meal plan/ }),
    ).not.toBeInTheDocument();
  });
});

describe('MealPlanWidget empty states', () => {
  it('says when the next plan starts when nothing is planned in the window', async () => {
    stub(
      windowOf([], {
        tag: { kind: 'none' },
        nextPlanStart: iso(10),
        nextPlanId: 'p9',
      }),
    );
    renderWidget();

    expect(
      await screen.findByRole('link', {
        name: 'Next plan starts Sunday 25 October',
      }),
    ).toHaveAttribute('href', '/meal-plans/p9');
    expect(screen.queryByText('Plan your week')).not.toBeInTheDocument();
  });

  it('offers to plan the week when there is no plan ahead', async () => {
    stub(windowOf([], { tag: { kind: 'none' } }));
    renderWidget();

    expect(
      await screen.findByText('Nothing planned this week.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Plan your week')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Plan your week' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('All covered')).not.toBeInTheDocument();
  });
});

describe('MealPlanWidget plan your week', () => {
  it('opens the empty plan that already covers today instead of a new one', async () => {
    stub(
      windowOf([], {
        tag: { kind: 'none' },
        plan: {
          id: 'p1',
          name: null,
          startDate: iso(-1),
          days: 7,
          servings: 2,
        },
      }),
    );
    renderWidget();

    expect(
      await screen.findByRole('link', { name: 'Plan your week' }),
    ).toHaveAttribute('href', '/meal-plans/p1');
  });
});

describe('MealPlanWidget legend', () => {
  it('shows until the first day popover is opened, then stays hidden on this device', async () => {
    const user = userEvent.setup();
    stub(windowOf(week(2)));
    const first = renderWidget();

    expect(await screen.findByText('Bars: B · L · D')).toBeInTheDocument();

    await user.click(columns()[0]);
    await screen.findByRole('dialog');
    expect(screen.queryByText('Bars: B · L · D')).not.toBeInTheDocument();

    first.unmount();
    renderWidget();
    await screen.findAllByRole('button', { name: /meal/ });
    expect(screen.queryByText('Bars: B · L · D')).not.toBeInTheDocument();
  });
});

describe('MealPlanWidget text', () => {
  it.each([
    ['en', 1, 'Meal plan · 1 day'],
    ['en', 3, 'Meal plan · 3 days'],
    ['ro', 1, 'Plan de mese · 1 zi'],
    ['ro', 3, 'Plan de mese · 3 zile'],
    ['ro', 7, 'Plan de mese · 7 zile'],
    ['da', 1, 'Madplan · 1 dag'],
    ['da', 4, 'Madplan · 4 dage'],
  ] as const)(
    'words the title in %s for %i day(s)',
    async (locale, n, text) => {
      stub(windowOf(week(n)));
      renderWidget(locale);

      const region = await screen.findByRole('region');
      await waitFor(() => expect(region).toHaveTextContent(text));
    },
  );

  it.each([
    ['ro', 1, '1 masă fără stoc'],
    ['ro', 3, '3 mese fără stoc'],
    ['da', 1, '1 måltid mangler'],
    ['da', 3, '3 måltider mangler'],
  ] as const)('words "short" in %s for %i', async (locale, count, text) => {
    stub(windowOf(week(2), { tag: { kind: 'short', count } }));
    renderWidget(locale);

    const region = await screen.findByRole('region');
    await waitFor(() => expect(region).toHaveTextContent(text));
  });
});

describe('MealPlanWidget day popover', () => {
  const user = () => userEvent.setup();

  it('opens under the column with the day, a title and its meals', async () => {
    const u = user();
    stub(
      windowOf([
        day(0, [
          {
            mealtime: 'breakfast',
            title: 'Porridge',
            status: 'covered',
            minutes: 10,
          },
          {
            mealtime: 'dinner',
            title: 'Omelette',
            status: 'short',
            issues: [
              issue({
                reason: {
                  code: 'onlyInPantry',
                  amount: 1,
                  unit: 'pcs',
                },
                quantity: 2,
              }),
            ],
          },
        ]),
        day(1),
      ]),
    );
    renderWidget();

    const column = (await screen.findAllByRole('button', { name: /meal/ }))[0];
    await u.click(column);

    const dialog = await screen.findByRole('dialog', { name: 'Today' });
    expect(column).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(dialog).getByText('Thursday 15 October · Short'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Breakfast')).toBeInTheDocument();
    expect(within(dialog).getByText('Porridge')).toBeInTheDocument();
    expect(within(dialog).getByText('2 Servings · 10 min')).toBeInTheDocument();
    expect(within(dialog).getByText('Covered')).toBeInTheDocument();
    expect(within(dialog).getByText('1 short')).toBeInTheDocument();
    expect(within(dialog).getByText('Eggs')).toBeInTheDocument();
    expect(within(dialog).getByText(/short 2 pcs/)).toBeInTheDocument();
    expect(
      within(dialog).getByText('Only 1 pcs in your Pantry'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Edit day')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: 'Edit day' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Today' })).toHaveFocus();
  });

  it('shows the Allergy Warning on a meal, naming whose Allergy it is', async () => {
    const u = user();
    stub(
      windowOf([
        day(0, [
          {
            mealtime: 'dinner',
            title: 'Satay',
            allergyWarning: {
              severity: 'strong',
              allergens: [
                {
                  id: 'a-pn',
                  name: 'Peanuts',
                  tier: 'yours',
                  severity: 'strong',
                  owners: [{ kind: 'own' }, { kind: 'family', label: 'Mia' }],
                },
              ],
              uncheckedCount: 0,
            },
          },
          { mealtime: 'lunch', title: 'Soup' },
        ]),
      ]),
    );
    renderWidget();

    await u.click((await screen.findAllByRole('button', { name: /meal/ }))[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Today' });
    const indicators = within(dialog).getAllByRole('img');
    expect(indicators).toHaveLength(1);
    expect(indicators[0]).toHaveAccessibleName('Contains Peanuts (you, Mia)');
  });

  it('words the reasons a line is short', async () => {
    const u = user();
    const meal = (n: number) => ({
      date: iso(n),
      mealtime: 'dinner' as const,
      recipeId: 'r',
      recipeTitle: 'Omelette',
    });
    stub(
      windowOf([
        day(2, [
          {
            mealtime: 'dinner',
            status: 'short',
            issues: [
              issue({
                name: 'Eggs',
                reason: { code: 'usesLast', meals: [meal(1)] },
              }),
              issue({
                name: 'Milk',
                kind: 'missing',
                quantity: 500,
                unit: 'ml',
                reason: {
                  code: 'usesLast',
                  meals: [
                    meal(0),
                    { ...meal(1), mealtime: 'breakfast' as const },
                  ],
                },
              }),
              issue({
                name: 'Flour',
                quantity: 1500,
                unit: 'g',
                reason: {
                  code: 'usesLast',
                  meals: [meal(0), meal(0), meal(1)],
                },
              }),
              issue({
                name: 'Leeks',
                reason: { code: 'expires', date: iso(1) },
              }),
              issue({
                name: 'Butter',
                reason: {
                  code: 'onlyLeftAfter',
                  amount: 100,
                  unit: 'g',
                  meals: [meal(0)],
                },
              }),
            ],
          },
        ]),
      ]),
    );
    renderWidget();

    await u.click(await screen.findByRole('button', { name: /meal/ }));
    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).getByText("Tomorrow's Omelette uses the last"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Today's dinner and Tomorrow's breakfast use the last",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('3 earlier meals use the last'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('need 500 ml')).toBeInTheDocument();
    expect(within(dialog).getByText(/short 1\.5 kg/)).toBeInTheDocument();
    expect(
      within(dialog).getByText('Yours expires Tomorrow'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Only 100 g left after Today's Omelette"),
    ).toBeInTheDocument();
  });

  it('shows an uncertain line as an unknown amount and an unavailable Recipe as no longer available', async () => {
    const u = user();
    stub(
      windowOf([
        day(0, [
          {
            mealtime: 'lunch',
            status: 'covered',
            issues: [
              issue({
                name: 'Rice',
                kind: 'uncertain',
                quantity: 200,
                unit: 'g',
                reason: { code: 'noQuantity' },
              }),
            ],
          },
          { mealtime: 'dinner', status: 'unavailable', title: 'Old stew' },
        ]),
      ]),
    );
    renderWidget();

    await u.click(await screen.findByRole('button', { name: /meal/ }));
    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).getByText('amount unknown, your Pantry has no quantity'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('No longer available')).toBeInTheDocument();
    expect(within(dialog).getByText('Old stew')).toBeInTheDocument();
    expect(within(dialog).queryByText(/short/)).not.toBeInTheDocument();
  });

  it('marks a line already on the list with an On list tag', async () => {
    const u = user();
    stub(
      windowOf([
        day(0, [{ status: 'onList', issues: [issue({ onList: true })] }]),
      ]),
    );
    renderWidget();

    await u.click(await screen.findByRole('button', { name: /meal/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText('On list')).toHaveLength(2);
  });

  it('offers "Plan a meal" on an empty day inside a plan and "Start a plan" outside every plan', async () => {
    const u = user();
    stub(
      windowOf([
        day(0),
        day(1, [], { status: 'empty', planId: 'p1' }),
        gap(2),
        day(3),
      ]),
    );
    renderWidget();

    await screen.findAllByRole('button', { name: /meal|nothing/ });
    await u.click(
      screen.getByRole('button', { name: /Friday 16 October: nothing/ }),
    );
    let dialog = await screen.findByRole('dialog', { name: 'Tomorrow' });
    expect(
      within(dialog).getByText('Nothing planned for Friday.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Plan a meal')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: 'Plan a meal' }),
    ).toBeInTheDocument();

    await u.click(within(dialog).getByRole('button', { name: 'Next day' }));
    dialog = await screen.findByRole('dialog', { name: 'Saturday' });
    expect(within(dialog).getByText('Start a plan')).toBeInTheDocument();
    expect(within(dialog).queryByText('Plan a meal')).not.toBeInTheDocument();
  });

  it('steps between days with the arrows and disables them at the ends', async () => {
    const u = user();
    stub(windowOf(week(3)));
    renderWidget();

    await u.click((await screen.findAllByRole('button', { name: /meal/ }))[0]);
    let dialog = await screen.findByRole('dialog', { name: 'Today' });
    expect(
      within(dialog).getByRole('button', { name: 'Previous day' }),
    ).toBeDisabled();

    await u.click(within(dialog).getByRole('button', { name: 'Next day' }));
    dialog = await screen.findByRole('dialog', { name: 'Tomorrow' });
    expect(columns()).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Tomorrow' })).toHaveFocus();

    await u.click(within(dialog).getByRole('button', { name: 'Next day' }));
    dialog = await screen.findByRole('dialog', { name: 'Saturday' });
    expect(
      within(dialog).getByRole('button', { name: 'Next day' }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole('button', { name: 'Previous day' }),
    ).toBeEnabled();

    await u.click(within(dialog).getByRole('button', { name: 'Previous day' }));
    expect(
      await screen.findByRole('dialog', { name: 'Tomorrow' }),
    ).toBeInTheDocument();
  });

  it.each([
    ['Escape', async (u: ReturnType<typeof user>) => u.keyboard('{Escape}')],
    [
      'a tap outside',
      async (u: ReturnType<typeof user>) => u.click(document.body),
    ],
    [
      '×',
      async (u: ReturnType<typeof user>) =>
        u.click(screen.getByRole('button', { name: 'Close' })),
    ],
    [
      'tapping the same column',
      async (u: ReturnType<typeof user>) =>
        u.click(screen.getAllByRole('button', { name: /meal/ })[0]),
    ],
  ])(
    'closes on %s and gives focus back to the column',
    async (_name, close) => {
      const u = user();
      stub(windowOf(week(3)));
      renderWidget();

      const column = (
        await screen.findAllByRole('button', { name: /meal/ })
      )[0];
      await u.click(column);
      await screen.findByRole('dialog');

      await close(u);

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(column).toHaveFocus();
      expect(column).toHaveAttribute('aria-expanded', 'false');
    },
  );

  it('moves the popover when another column is tapped', async () => {
    const u = user();
    stub(windowOf(week(3)));
    renderWidget();

    const all = await screen.findAllByRole('button', { name: /meal/ });
    await u.click(all[0]);
    await screen.findByRole('dialog', { name: 'Today' });
    await u.click(all[2]);
    expect(
      await screen.findByRole('dialog', { name: 'Saturday' }),
    ).toBeInTheDocument();
  });

  it('leaves focus on the field tapped outside the popover', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stub(windowOf(week(3)));
    renderWidget();
    const field = document.createElement('input');
    document.body.append(field);

    await u.click((await screen.findAllByRole('button', { name: /meal/ }))[0]);
    await screen.findByRole('dialog');
    await u.click(field);

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    // Give a wrongly restored focus (the popover handing it back to its trigger) time to show.
    await vi.advanceTimersByTimeAsync(10);
    expect(field).toHaveFocus();
    field.remove();
  });

  describe('when the window refetches while a popover is open', () => {
    it('keeps showing the same date even if its column moves', async () => {
      const u = user();
      let view = windowOf(week(4));
      stub(() => view);
      const { queryClient } = renderWidget();

      await u.click(
        (await screen.findAllByRole('button', { name: /meal/ }))[2],
      );
      await screen.findByRole('dialog', { name: 'Saturday' });

      view = windowOf([1, 2, 3].map((offset) => day(offset)));
      await queryClient.invalidateQueries();

      await waitFor(() => expect(columns()).toHaveLength(3));
      expect(
        screen.getByRole('dialog', { name: 'Saturday' }),
      ).toBeInTheDocument();
    });

    it('closes when its date leaves the window', async () => {
      const u = user();
      let view = windowOf(week(4));
      stub(() => view);
      const { queryClient } = renderWidget();

      await u.click(
        (await screen.findAllByRole('button', { name: /meal/ }))[2],
      );
      await screen.findByRole('dialog', { name: 'Saturday' });

      view = windowOf([day(0), day(1)]);
      await queryClient.invalidateQueries();

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
    });

    it('moves focus to the nearest remaining column when it closes', async () => {
      const u = user();
      let view = windowOf(week(4));
      stub(() => view);
      const { queryClient } = renderWidget();

      await u.click(
        (await screen.findAllByRole('button', { name: /meal/ }))[2],
      );
      await screen.findByRole('dialog', { name: 'Saturday' });
      expect(screen.getByRole('heading', { name: 'Saturday' })).toHaveFocus();

      view = windowOf([day(0), day(1)]);
      await queryClient.invalidateQueries();

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(
        screen.getByRole('button', { name: /^Friday 16 October/ }),
      ).toHaveFocus();
    });
  });

  it('is as wide as the card less 24 px, up to 340', async () => {
    const u = user();
    stub(windowOf(week(3)));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        // The card is 300 wide; its content is inside 14 px of padding.
        const width = this.parentElement?.tagName === 'SECTION' ? 272 : 0;
        return {
          left: 0,
          top: 0,
          width,
          height: 0,
          right: width,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      },
    );
    renderWidget();

    await u.click((await screen.findAllByRole('button', { name: /meal/ }))[0]);
    expect(await screen.findByRole('dialog')).toHaveStyle({ width: '276px' });
  });

  describe('placement', () => {
    const rect = (left: number, top: number, width: number, height: number) =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;

    function stubRects(column: DOMRect) {
      vi.spyOn(
        HTMLElement.prototype,
        'getBoundingClientRect',
      ).mockImplementation(function (this: HTMLElement) {
        if (this.getAttribute('role') === 'dialog') return rect(0, 0, 340, 300);
        if (this.hasAttribute('aria-haspopup')) return column;
        return rect(0, 0, 0, 0);
      });
    }

    it('opens below the column, centred on it and 10 px away', async () => {
      const u = user();
      stub(windowOf(week(3)));
      stubRects(rect(180, 200, 40, 100));
      renderWidget();

      await u.click(
        (await screen.findAllByRole('button', { name: /meal/ }))[0],
      );
      const dialog = await screen.findByRole('dialog');

      expect(dialog).toHaveAttribute('data-placement', 'below');
      expect(dialog).toHaveStyle({ left: '30px', top: '310px' });
      expect(dialog.style.getPropertyValue('--arrow-x')).toBe('170px');
    });

    it('flips above the column when it would run under the dock', async () => {
      const u = user();
      stub(windowOf(week(3)));
      // 768 px high: the Dock's top edge is at 676.
      stubRects(rect(180, 500, 40, 100));
      renderWidget();

      await u.click(
        (await screen.findAllByRole('button', { name: /meal/ }))[0],
      );
      const dialog = await screen.findByRole('dialog');

      expect(dialog).toHaveAttribute('data-placement', 'above');
      expect(dialog).toHaveStyle({ top: '190px' });
    });

    it('does not flip above into the status bar: it stays below, under the top inset', async () => {
      const u = user();
      stub(windowOf(week(3)));
      // Above the column would start at 30, inside a 59 px Dynamic Island inset (67 with the gap).
      stubRects(rect(180, 340, 40, 100));
      const real = window.getComputedStyle.bind(window);
      vi.spyOn(window, 'getComputedStyle').mockImplementation(
        (element, pseudo) =>
          element.hasAttribute('data-safe-area-probe')
            ? ({
                paddingTop: '59px',
                paddingBottom: '0px',
              } as CSSStyleDeclaration)
            : real(element, pseudo),
      );
      renderWidget();

      await u.click(
        (await screen.findAllByRole('button', { name: /meal/ }))[0],
      );
      const dialog = await screen.findByRole('dialog');

      expect(dialog).toHaveAttribute('data-placement', 'below');
      expect(Number.parseFloat(dialog.style.top)).toBeGreaterThanOrEqual(67);
    });

    it('stays 12 px inside the screen edge, with the arrow still on the column', async () => {
      const u = user();
      stub(windowOf(week(3)));
      stubRects(rect(0, 200, 40, 100));
      renderWidget();

      await u.click(
        (await screen.findAllByRole('button', { name: /meal/ }))[0],
      );
      const dialog = await screen.findByRole('dialog');

      expect(dialog).toHaveStyle({ left: '12px' });
      expect(dialog.style.getPropertyValue('--arrow-x')).toBe('18px');
    });
  });
});

describe('MealPlanWidget Add missing', () => {
  const user = () => userEvent.setup();

  const eggs = issue({ ingredientId: 'eggs', name: 'Eggs', quantity: 2 });
  const lemons = issue({
    ingredientId: 'lemons',
    name: 'Lemons',
    kind: 'missing',
    quantity: 1,
  });
  const feta = issue({ ingredientId: 'feta', name: 'Feta', quantity: 100 });
  const flour = issue({ ingredientId: 'flour', name: 'Flour', quantity: 500 });
  const missingOf = (...issues: PlanIssue[]) =>
    issues.map((i) => ({
      ingredientId: i.ingredientId,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      recipeIds: ['r'],
    }));

  const shortWeek = () =>
    windowOf(
      [
        day(0, [{ status: 'short', issues: [eggs, lemons] }]),
        day(1, [{ status: 'short', issues: [eggs] }]),
        day(2, [{ status: 'short', issues: [feta, flour] }]),
      ],
      {
        tag: { kind: 'short', count: 3 },
        missing: missingOf(eggs, lemons, feta, flour),
      },
    );

  /** A window that turns into `after` once the add has been posted; the Shopping List delete is recorded. */
  function setup(
    before: MealWindow,
    after: MealWindow,
    created = ['sh1', 'sh2', 'sh3'],
    {
      failPost = false,
      missingDeletes = [] as string[],
      count = created.length,
    } = {},
  ) {
    let current = before;
    const deleted: string[] = [];
    let release = () => {};
    let gate = Promise.resolve();
    const list = () =>
      Response.json({
        id: 'l',
        groups: [],
        summary: { remaining: 0, checked: 0 },
      });
    const { fetchMock, calls } = stubApi({
      'GET /api/meal-plans/window': () => Response.json(current),
      'GET /api/shopping-list': list,
      'POST /api/meal-plans/add-missing': async () => {
        await gate;
        if (failPost) {
          return Response.json(
            { code: 'validation_failed', params: {} },
            { status: 400 },
          );
        }
        current = after;
        return Response.json({ createdIds: created, count });
      },
      ...Object.fromEntries(
        ['sh1', 'sh2', 'sh3'].map((id) => [
          `DELETE /api/shopping-list/items/${id}`,
          () => {
            deleted.push(id);
            return missingDeletes.includes(id)
              ? Response.json(
                  { code: 'shopping.item_not_found', params: {} },
                  { status: 404 },
                )
              : list();
          },
        ]),
      ),
    });
    vi.stubGlobal('fetch', fetchMock);
    return {
      calls,
      deleted,
      posts: () =>
        calls
          .filter((call) => call.key === 'POST /api/meal-plans/add-missing')
          .map((call) => call.body),
      hold: () => {
        gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        return () => release();
      },
    };
  }

  const allOnList = (view: MealWindow): MealWindow => ({
    ...view,
    tag: { kind: 'coveredOnceYouShop' },
    missing: [],
    days: view.days.map((d) => ({
      ...d,
      status: 'onList',
      slots: d.slots.map((s) => ({
        ...s,
        status: 'onList',
        issues: s.issues.map((i) => ({ ...i, onList: true })),
      })),
    })),
  });

  it('hides the footer when nothing missing is left off the Shopping List', async () => {
    stub(windowOf(week(3), { missing: [] }));
    renderWidget();

    await screen.findAllByRole('button', { name: /meal/ });
    expect(screen.queryByText(/Missing for the plan/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Add \d+$/ }),
    ).not.toBeInTheDocument();
  });

  it('names the first three missing Ingredients and the rest in the footer', async () => {
    setup(shortWeek(), allOnList(shortWeek()));
    renderWidget();

    const footer = await screen.findByText(/Missing for the plan:/);
    expect(footer).toHaveTextContent(
      'Missing for the plan: Eggs, Lemons, Feta',
    );
    expect(footer).toHaveTextContent('+1');
    expect(screen.getByRole('button', { name: 'Add 4' })).toBeInTheDocument();
  });

  it('adds the whole window from the footer, sending only its scope, and says how many', async () => {
    const u = user();
    const api = setup(shortWeek(), allOnList(shortWeek()));
    renderWidget();

    await u.click(await screen.findByRole('button', { name: 'Add 4' }));

    expect(
      await screen.findByText('3 added to the Shopping List'),
    ).toBeInTheDocument();
    expect(api.posts()).toEqual([{ scope: 'window' }]);
    await waitFor(() =>
      expect(
        screen.queryByText(/Missing for the plan/),
      ).not.toBeInTheDocument(),
    );
    // The Widget reads the forecast again once the add settles.
    await waitFor(() =>
      expect(
        api.calls.filter((c) => c.key === 'GET /api/meal-plans/window').length,
      ).toBeGreaterThan(1),
    );
  });

  it('undoes exactly the Shopping Items the add created', async () => {
    const u = user();
    const api = setup(shortWeek(), allOnList(shortWeek()), ['sh1', 'sh3']);
    renderWidget();
    await u.click(await screen.findByRole('button', { name: 'Add 4' }));
    await screen.findByText('2 added to the Shopping List');

    await u.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(api.deleted).toEqual(['sh1', 'sh3']));
  });

  it('adds one day from the popover, sending only its date', async () => {
    const u = user();
    const api = setup(shortWeek(), allOnList(shortWeek()), ['sh1', 'sh2']);
    renderWidget();
    await u.click((await screen.findAllByRole('button', { name: /meal/ }))[0]);
    const dialog = await screen.findByRole('dialog');

    await u.click(
      within(dialog).getByRole('button', { name: 'Add 2 missing' }),
    );

    await screen.findByText('2 added to the Shopping List');
    expect(api.posts()).toEqual([{ scope: 'date', date: iso(0) }]);
  });

  it('adds one Ingredient from its + line, sending only that Ingredient', async () => {
    const u = user();
    const api = setup(shortWeek(), allOnList(shortWeek()), ['sh1']);
    renderWidget();
    await u.click((await screen.findAllByRole('button', { name: /meal/ }))[0]);
    const dialog = await screen.findByRole('dialog');

    await u.click(
      within(dialog).getByRole('button', {
        name: 'Add Lemons to the Shopping List',
      }),
    );

    await screen.findByText('1 added to the Shopping List');
    expect(api.posts()).toEqual([
      { scope: 'ingredient', ingredientId: 'lemons' },
    ]);
  });

  it('flips the added Ingredients to "On list" at once, before the server answers', async () => {
    const u = user();
    const api = setup(shortWeek(), allOnList(shortWeek()), ['sh1']);
    const release = api.hold();
    renderWidget();
    await u.click((await screen.findAllByRole('button', { name: /meal/ }))[0]);
    const dialog = await screen.findByRole('dialog');

    await u.click(
      within(dialog).getByRole('button', {
        name: 'Add Lemons to the Shopping List',
      }),
    );

    await waitFor(() =>
      expect(
        within(dialog).queryByRole('button', {
          name: 'Add Lemons to the Shopping List',
        }),
      ).not.toBeInTheDocument(),
    );
    expect(within(dialog).getAllByText('On list').length).toBeGreaterThan(0);
    // Eggs is still to add; the day button counts one less.
    expect(
      within(dialog).getByRole('button', { name: 'Add 1 missing' }),
    ).toBeInTheDocument();
    release();
    await screen.findByText('1 added to the Shopping List');
  });

  it('hides the day Add and the + buttons once everything on that day is on the list', async () => {
    const u = user();
    stub(
      windowOf(
        [day(0, [{ status: 'onList', issues: [{ ...eggs, onList: true }] }])],
        {
          missing: [],
          tag: { kind: 'coveredOnceYouShop' },
        },
      ),
    );
    renderWidget();
    await u.click((await screen.findAllByRole('button', { name: /meal/ }))[0]);
    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).queryByRole('button', { name: /missing$/ }),
    ).toBeNull();
    expect(
      within(dialog).queryByRole('button', { name: /to the Shopping List/ }),
    ).toBeNull();
    expect(within(dialog).getAllByText('On list').length).toBeGreaterThan(0);
  });

  it('puts the buttons back and shows an error when the add fails', async () => {
    const u = user();
    setup(shortWeek(), allOnList(shortWeek()), ['sh1'], { failPost: true });
    renderWidget();
    await u.click((await screen.findAllByRole('button', { name: /meal/ }))[0]);
    const dialog = await screen.findByRole('dialog');

    await u.click(
      within(dialog).getByRole('button', {
        name: 'Add Lemons to the Shopping List',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please check what you entered',
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', {
          name: 'Add Lemons to the Shopping List',
        }),
      ).toBeEnabled(),
    );
    expect(
      within(dialog).getByRole('button', { name: 'Add 2 missing' }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Add 4' })).toBeInTheDocument();
    expect(screen.queryByText(/added to the Shopping List/)).toBeNull();
  });

  it('offers no Undo when everything merged into lines already on the list', async () => {
    const u = user();
    setup(shortWeek(), allOnList(shortWeek()), [], { count: 2 });
    renderWidget();

    await u.click(await screen.findByRole('button', { name: 'Add 4' }));

    expect(
      await screen.findByText('2 added to the Shopping List'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('carries on undoing past an item that is already gone', async () => {
    const u = user();
    const api = setup(
      shortWeek(),
      allOnList(shortWeek()),
      ['sh1', 'sh2', 'sh3'],
      {
        missingDeletes: ['sh1'],
      },
    );
    renderWidget();
    await u.click(await screen.findByRole('button', { name: 'Add 4' }));
    await screen.findByText('3 added to the Shopping List');

    await u.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(api.deleted).toEqual(['sh1', 'sh2', 'sh3']));
  });

  it('counts an Unmatched Ingredient once however its name is cased', async () => {
    const u = user();
    const a = issue({ ingredientId: null, name: 'Dragon fruit' });
    const b = issue({ ingredientId: null, name: ' dragon FRUIT ' });
    stub(
      windowOf(
        [
          day(0, [
            { mealtime: 'lunch', status: 'short', issues: [a] },
            { mealtime: 'dinner', status: 'short', issues: [b] },
          ]),
        ],
        { tag: { kind: 'short', count: 2 }, missing: missingOf(a) },
      ),
    );
    renderWidget();
    await u.click((await screen.findAllByRole('button', { name: /meal/ }))[0]);
    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).getByRole('button', { name: 'Add 1 missing' }),
    ).toBeInTheDocument();
  });
});

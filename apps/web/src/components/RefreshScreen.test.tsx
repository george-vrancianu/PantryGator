import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen } from '@testing-library/react';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PantryPage } from '../pages/Pantry/PantryPage';
import { RecipesPage } from '../pages/Recipes/RecipesPage';
import { REFRESH_LOADER_RETRACT_MS } from '@pocket-pantry/ui';
import { MIN_BUSY_MS } from '../lib/refresh';
import { AppLayout } from './AppLayout';
import {
  renderInAppLayout,
  renderWithProviders,
  stubApi,
} from '../test/render';
import { stubMatchMedia } from '../test/viewport';
import { AppScreenHeader } from './AppScreenHeader';

const batch = {
  id: 'b1',
  name: 'Milk',
  ingredientId: 'milk-id',
  unmatched: false,
  aisle: null,
  amountScale: null,
  defaultUnit: null,
  defaultExpiryDays: null,
  quantity: null,
  unit: null,
  location: 'fridge',
  expiryDate: null,
  productDescription: null,
  createdAt: '2026-10-01T00:00:00Z',
};

/** The voice mic's Credit Price reads the Credits, which the tab-root refresh refetches too. */
const creditsRoute = {
  'GET /api/credits': () =>
    Response.json({
      balance: 100,
      prices: { voice: 1 },
      lowBalanceThreshold: 10,
      history: [],
    }),
};

function stubPantry(
  pantry: () => Response | Promise<Response>,
  staples: () => Response | Promise<Response> = () =>
    Response.json({ staples: [] }),
) {
  const { fetchMock, calls } = stubApi({
    'GET /api/pantry': pantry,
    ...creditsRoute,
    'GET /api/voice/config': () => Response.json({ configured: true }),
    'GET /api/staples': staples,
    'GET /api/settings/preferences': () => Response.json({}),
    // The Empty Pantry state reads the Shopping List for its shelf cards.
    'GET /api/shopping-list': () =>
      Response.json({
        id: 'l1',
        groups: [],
        summary: { remaining: 0, checked: 0 },
      }),
    'GET /api/pantry/recently-stocked': () =>
      Response.json({ ingredients: [] }),
    'GET /api/settings/family': () =>
      Response.json({ staleThresholdDays: 3, expiryOverrides: [] }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const elapse = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
/** Lets the loader's minimum time down run out, so the run's outcome lands. */
const finish = () => elapse(MIN_BUSY_MS);
const loaderShown = () =>
  screen.getByTestId('refresh-loader').getAttribute('data-shown');
const tap = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
const gets = (calls: Array<{ key: string }>) =>
  calls.filter((c) => c.key === 'GET /api/pantry').length;

async function openPantry(locale: 'en' | 'ro' | 'da' = 'en') {
  renderInAppLayout(<PantryPage />, '/pantry', { locale });
  await settle();
}

describe('Refresh mark on a tab root', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('refetches, drops the loader while saying Refreshing, then tucks it up and says Updated just now until 2.5 s', async () => {
    stubPantry(() => Response.json({ batches: [batch] }));
    await openPantry();
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(loaderShown()).toBe('false');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    stubPantry(async () => {
      await gate;
      return Response.json({ batches: [batch] });
    });
    tap();
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing…');
    expect(loaderShown()).toBe('true');
    release();
    await finish();
    expect(screen.getByRole('status')).toHaveTextContent('Updated just now');
    expect(loaderShown()).toBe('false');
    await elapse(2499);
    expect(screen.getByRole('status')).toHaveTextContent('Updated just now');
    await elapse(1);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('keeps the loader down 0.7 s even when the requests answer at once', async () => {
    stubPantry(() => Response.json({ batches: [batch] }));
    await openPantry();
    tap();
    await elapse(MIN_BUSY_MS - 1);
    expect(loaderShown()).toBe('true');
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing…');
    await elapse(1);
    expect(loaderShown()).toBe('false');
    expect(screen.getByRole('status')).toHaveTextContent('Updated just now');
  });

  it('keeps the refresh copy out of the header', async () => {
    stubPantry(() => Response.json({ batches: [batch] }));
    await openPantry();
    tap();
    expect(screen.getByRole('banner')).not.toHaveTextContent('Refreshing…');
    await finish();
    expect(screen.getByRole('banner')).not.toHaveTextContent(
      'Updated just now',
    );
  });

  it('repeats the screen requests on a tap', async () => {
    const calls = stubPantry(() => Response.json({ batches: [batch] }));
    await openPantry();
    const before = gets(calls);
    tap();
    await settle();
    expect(gets(calls)).toBe(before + 1);
  });

  it('sends no second round of requests for a tap while busy, and dims the content meanwhile', async () => {
    stubPantry(() => Response.json({ batches: [batch] }));
    await openPantry();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const calls = stubPantry(async () => {
      await gate;
      return Response.json({ batches: [batch] });
    });
    const content = () => getComputedStyle(screen.getByTestId('sheet-content'));
    expect(content().opacity).toBe('1');
    tap();
    tap();
    expect(gets(calls)).toBe(1);
    expect(content().opacity).toBe('0.55');
    release();
    await finish();
    expect(gets(calls)).toBe(1);
    expect(content().opacity).toBe('1');
  });

  it('says the failure, keeps the data shown, and clears after 4 s', async () => {
    stubPantry(() => Response.json({ batches: [batch] }));
    await openPantry();
    stubPantry(() =>
      Response.json({ code: 'boom', params: {} }, { status: 500 }),
    );
    tap();
    await finish();
    expect(screen.getByRole('status')).toHaveTextContent(
      "Couldn't refresh · showing what you had",
    );
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(loaderShown()).toBe('true');
    await elapse(1100);
    expect(loaderShown()).toBe('false');
    await elapse(3999 - 1100);
    expect(screen.getByRole('status')).not.toBeEmptyDOMElement();
    await elapse(1);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it("re-enters the mark's head once the loader is back up after a successful refresh, not after a failed one", async () => {
    const motion = () =>
      screen
        .getByRole('button', { name: 'Refresh' })
        .getAttribute('data-motion');
    stubPantry(() => Response.json({ batches: [batch] }));
    await openPantry();
    await elapse(1300);
    stubPantry(() =>
      Response.json({ code: 'boom', params: {} }, { status: 500 }),
    );
    tap();
    await settle();
    expect(motion()).toBe('tap');
    await elapse(900);
    expect(motion()).toBe('idle');
    await elapse(1300);
    expect(motion()).toBe('idle');
    await elapse(2700);
    stubPantry(() => Response.json({ batches: [batch] }));
    tap();
    await settle();
    expect(motion()).toBe('tap');
    await elapse(900);
    expect(motion()).toBe('idle');
    await elapse(MIN_BUSY_MS + REFRESH_LOADER_RETRACT_MS - 900 - 1);
    expect(motion()).toBe('idle');
    await elapse(1);
    expect(motion()).toBe('reentrance');
  });

  it('stays busy until every query has settled, even when one fails at once', async () => {
    stubPantry(() => Response.json({ batches: [batch] }));
    await openPantry();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const calls = stubPantry(
      () => Response.json({ code: 'boom', params: {} }, { status: 500 }),
      async () => {
        await gate;
        return Response.json({ staples: [] });
      },
    );
    tap();
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing…');
    tap();
    await settle();
    expect(gets(calls)).toBe(1);
    release();
    await finish();
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't refresh");
  });

  it('reports a failure when the device is offline', async () => {
    stubPantry(() => Response.json({ batches: [batch] }));
    await openPantry();
    onlineManager.setOnline(false);
    try {
      tap();
      await finish();
      expect(screen.getByRole('status')).toHaveTextContent(
        "Couldn't refresh · showing what you had",
      );
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('still says Refreshing… when the Member prefers reduced motion', async () => {
    stubMatchMedia((query) => query.includes('prefers-reduced-motion'));
    stubPantry(() => Response.json({ batches: [batch] }));
    await openPantry();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    stubPantry(async () => {
      await gate;
      return Response.json({ batches: [batch] });
    });
    tap();
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing…');
    release();
    await settle();
  });

  it.each([
    ['ro', 'Reîmprospătează', 'Se reîmprospătează…', 'Actualizat chiar acum'],
    ['da', 'Opdater', 'Opdaterer…', 'Opdateret lige nu'],
  ] as const)(
    'names the button and says the status in %s',
    async (locale, name, busy, done) => {
      stubPantry(() => Response.json({ batches: [] }));
      await openPantry(locale);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      stubPantry(async () => {
        await gate;
        return Response.json({ batches: [] });
      });
      fireEvent.click(screen.getByRole('button', { name }));
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent(busy);
      release();
      await finish();
      expect(screen.getByRole('status')).toHaveTextContent(done);
    },
  );

  it.each([
    [
      'ro',
      'Reîmprospătează',
      'Nu s-a putut reîmprospăta · se afișează ce aveai',
    ],
    ['da', 'Opdater', 'Kunne ikke opdatere · viser det, du havde'],
  ] as const)('says the failure line in %s', async (locale, name, failed) => {
    stubPantry(() => Response.json({ batches: [] }));
    await openPantry(locale);
    stubPantry(() =>
      Response.json({ code: 'boom', params: {} }, { status: 500 }),
    );
    fireEvent.click(screen.getByRole('button', { name }));
    await finish();
    expect(screen.getByRole('status')).toHaveTextContent(failed);
  });
});

describe('Refresh mark placement', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['/pantry', true],
    ['/shopping', true],
    ['/recipes', true],
    ['/meal-plans', false],
    ['/settings', false],
    ['/recipes/new', false],
  ])('%s: mark shown is %s', (path, shown) => {
    renderInAppLayout(<AppScreenHeader title="Title" />, path);
    expect(!!screen.queryByRole('button', { name: 'Refresh' })).toBe(shown);
  });
});

describe('Refresh state follows the screen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function openTwoScreens() {
    const Screen = ({ title, to }: { title: string; to: string }) => (
      <>
        <AppScreenHeader title={title} />
        <Link to={to}>Go on</Link>
        <p>{title} content</p>
      </>
    );
    return renderWithProviders(
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            path="/pantry"
            element={<Screen title="Pantry" to="/shopping" />}
          />
          <Route
            path="/shopping"
            element={<Screen title="Shopping" to="/meal-plans" />}
          />
          <Route
            path="/meal-plans"
            element={<Screen title="Plans" to="/pantry" />}
          />
        </Route>
      </Routes>,
      { route: '/pantry' },
    );
  }

  it('does not carry "Updated just now" over to the next screen', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        ...creditsRoute,
        'GET /api/voice/config': () => Response.json({ configured: true }),
        'GET /api/staples': () => Response.json({ staples: [] }),
        'GET /api/settings/preferences': () => Response.json({}),
      }).fetchMock,
    );
    openTwoScreens();
    await settle();
    tap();
    await finish();
    expect(screen.getByRole('status')).toHaveTextContent('Updated just now');
    fireEvent.click(screen.getByRole('link', { name: 'Go on' }));
    await settle();
    expect(screen.getByText('Shopping content')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('does not dim the next screen, nor report the old run there, when the Member moves on while busy', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { fetchMock } = stubApi({
      'GET /api/voice/config': () => Response.json({ configured: true }),
      'GET /api/staples': async () => {
        await gate;
        return Response.json({ staples: [] });
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    openTwoScreens();
    await settle();
    tap();
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing…');
    fireEvent.click(screen.getByRole('link', { name: 'Go on' }));
    await settle();
    const content = screen.getByTestId('sheet-content');
    expect(getComputedStyle(content).opacity).toBe('1');
    release();
    await elapse(MIN_BUSY_MS + REFRESH_LOADER_RETRACT_MS);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(getComputedStyle(content).opacity).toBe('1');
    expect(loaderShown()).toBe('false');
  });

  it("does not re-enter the next screen's mark for a run done on the screen just left", async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        ...creditsRoute,
        'GET /api/voice/config': () => Response.json({ configured: true }),
        'GET /api/staples': () => Response.json({ staples: [] }),
        'GET /api/settings/preferences': () => Response.json({}),
      }).fetchMock,
    );
    openTwoScreens();
    await elapse(1300);
    tap();
    await finish();
    expect(screen.getByRole('status')).toHaveTextContent('Updated just now');
    fireEvent.click(screen.getByRole('link', { name: 'Go on' }));
    await settle();
    expect(screen.getByText('Shopping content')).toBeInTheDocument();
    await elapse(REFRESH_LOADER_RETRACT_MS + 100);
    expect(
      screen
        .getByRole('button', { name: 'Refresh' })
        .getAttribute('data-motion'),
    ).not.toBe('reentrance');
  });

  it('plays one re-entrance, for the newer run, when the Member taps again while the loader tucks up', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        ...creditsRoute,
        'GET /api/voice/config': () => Response.json({ configured: true }),
        'GET /api/staples': () => Response.json({ staples: [] }),
        'GET /api/settings/preferences': () => Response.json({}),
      }).fetchMock,
    );
    openTwoScreens();
    await elapse(1300);
    const motion = () =>
      screen
        .getByRole('button', { name: 'Refresh' })
        .getAttribute('data-motion');
    tap();
    await elapse(900);
    // Done at 700 ms; the second tap lands at 900 ms, while the loader tucks up. Its Tap motion ends at 1800 ms.
    tap();
    await elapse(1000);
    // The second run is done at 1600 ms; its re-entrance waits for the tuck, until 1980 ms.
    expect(loaderShown()).toBe('false');
    expect(motion()).toBe('idle');
    await elapse(MIN_BUSY_MS + REFRESH_LOADER_RETRACT_MS - 1000 - 1);
    expect(motion()).toBe('idle');
    await elapse(1);
    expect(motion()).toBe('reentrance');
  });

  it('comes back idle and at full opacity after a round trip begun while busy', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { fetchMock } = stubApi({
      'GET /api/voice/config': () => Response.json({ configured: true }),
      'GET /api/staples': async () => {
        await gate;
        return Response.json({ staples: [] });
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    openTwoScreens();
    await settle();
    tap();
    fireEvent.click(screen.getByRole('link', { name: 'Go on' }));
    await settle();
    release();
    await settle();
    fireEvent.click(screen.getByRole('link', { name: 'Go on' }));
    await settle();
    fireEvent.click(screen.getByRole('link', { name: 'Go on' }));
    await settle();
    await elapse(10000);
    const content = screen.getByTestId('sheet-content');
    expect(getComputedStyle(content).opacity).toBe('1');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('does not show "Updated just now" again after a round trip', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        ...creditsRoute,
        'GET /api/voice/config': () => Response.json({ configured: true }),
        'GET /api/staples': () => Response.json({ staples: [] }),
        'GET /api/settings/preferences': () => Response.json({}),
      }).fetchMock,
    );
    openTwoScreens();
    await settle();
    tap();
    await finish();
    expect(screen.getByRole('status')).toHaveTextContent('Updated just now');
    fireEvent.click(screen.getByRole('link', { name: 'Go on' }));
    await settle();
    fireEvent.click(screen.getByRole('link', { name: 'Go on' }));
    await settle();
    fireEvent.click(screen.getByRole('link', { name: 'Go on' }));
    await settle();
    expect(screen.getByText('Pantry content')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});

describe('Tab-root header controls beside the mark', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the Pantry add button', () => {
    vi.stubGlobal('fetch', stubApi({}).fetchMock);
    renderInAppLayout(<PantryPage />, '/pantry');
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add batch' }),
    ).toBeInTheDocument();
  });

  it('keeps the Recipes Explore pill and add button', () => {
    vi.stubGlobal('fetch', stubApi({}).fetchMock);
    renderInAppLayout(<RecipesPage />, '/recipes');
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explore' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add a Recipe' }),
    ).toBeInTheDocument();
  });
});

import { act, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  renderInAppLayout,
  renderWithProviders,
  stubApi,
} from '../../test/render';
import { stubViewport } from '../../test/viewport';
import { makeScrollable, pull } from '../../test/scroll';
import { MIN_BUSY_MS } from '../../lib/refresh';
import { DashboardPage } from './DashboardPage';

afterEach(() => vi.unstubAllGlobals());

function stub(layout: unknown) {
  const { fetchMock } = stubApi({
    'GET /api/dashboard-layout': () => Response.json(layout),
    'GET /api/pantry': () => Response.json({ batches: [] }),
    'GET /api/shopping-list': () =>
      Response.json({
        id: 'l',
        groups: [],
        summary: { remaining: 0, checked: 0 },
      }),
  });
  vi.stubGlobal('fetch', fetchMock);
}

describe('DashboardPage', () => {
  it("renders the Member's Widgets in layout order and skips unknown types", async () => {
    stub({
      widgets: [
        { id: 'a', type: 'meal-plan', size: 'wide' },
        { id: 'b', type: 'from-the-future', size: 'small' },
        { id: 'c', type: 'budget', size: 'small' },
      ],
    });

    renderWithProviders(<DashboardPage />);

    const regions = await screen.findAllByRole('region');
    expect(regions.map((region) => region.getAttribute('aria-label'))).toEqual([
      'Meal plan',
      'Budget',
    ]);
  });

  describe('Pantry Health', () => {
    function stubHealth(layout: unknown) {
      const { fetchMock } = stubApi({
        'GET /api/dashboard-layout': () => Response.json(layout),
        'GET /api/settings/family': () =>
          Response.json({ staleThresholdDays: 3, expiryOverrides: [] }),
        'GET /api/pantry': () => Response.json({ batches: [], runningLow: [] }),
        'GET /api/pantry/last-stocked': () =>
          Response.json({ lastStockedAt: null }),
        'GET /api/staples': () => Response.json({ staples: [] }),
        'GET /api/shopping-list/suggestions': () =>
          Response.json({
            staples: [],
            usedUp: [],
            runningLow: [],
            expired: [],
            dismissed: [],
          }),
        'GET /api/shopping-list': () =>
          Response.json({
            id: 'l',
            groups: [],
            summary: { remaining: 0, checked: 0 },
          }),
      });
      vi.stubGlobal('fetch', fetchMock);
    }

    it('shows the dial and lights in the header, not as a Widget', async () => {
      stubHealth({ widgets: [{ id: 'a', type: 'budget', size: 'small' }] });

      renderInAppLayout(<DashboardPage />, '/');

      const cluster = await screen.findByRole('button', {
        name: 'Pantry health: Not enough to judge yet, no warning lights.',
      });
      expect(cluster.closest('[data-region="header"]')).not.toBeNull();
      expect(
        screen
          .getAllByRole('region')
          .map((region) => region.getAttribute('aria-label')),
      ).toEqual(['Budget']);
    });

    it('loads a stored layout that still holds a health Widget without it', async () => {
      stubHealth({
        widgets: [
          { id: 'h', type: 'health', size: 'wide' },
          { id: 'a', type: 'budget', size: 'small' },
        ],
      });

      renderInAppLayout(<DashboardPage />, '/');

      await screen.findByRole('region', { name: 'Budget' });
      expect(
        screen
          .getAllByRole('region')
          .map((region) => region.getAttribute('aria-label')),
      ).toEqual(['Budget']);
      expect(
        screen.getAllByRole('button', { name: /^Pantry health: / }),
      ).toHaveLength(1);
    });
  });

  it.each([
    [390, 'repeat(2, minmax(0, 1fr))'],
    [768, 'repeat(3, minmax(0, 1fr))'],
    [1280, 'repeat(4, minmax(0, 1fr))'],
  ])(
    'lays Widgets out in the right columns at %ipx',
    async (width, columns) => {
      stubViewport(width);
      stub({ widgets: [{ id: 'a', type: 'budget', size: 'small' }] });

      renderWithProviders(<DashboardPage />);

      const widget = await screen.findByRole('region', { name: 'Budget' });
      const grid = widget.parentElement as HTMLElement;
      expect(getComputedStyle(grid).gridTemplateColumns).toBe(columns);
    },
  );

  it('shows a tall Widget two rows high only from 900px, and keeps its saved size', async () => {
    stub({ widgets: [{ id: 'a', type: 'use-soon', size: 'tall' }] });

    stubViewport(1280);
    const wide = renderWithProviders(<DashboardPage />);
    let card = await screen.findByRole('region', { name: 'Use soon' });
    expect(getComputedStyle(card).gridRow).toBe('span 2');
    expect(getComputedStyle(card).gridColumn).toBe('span 2');
    wide.unmount();

    stubViewport(768);
    renderWithProviders(<DashboardPage />);
    card = await screen.findByRole('region', { name: 'Use soon' });
    expect(getComputedStyle(card).gridRow).not.toBe('span 2');
    expect(getComputedStyle(card).gridColumn).toBe('span 2');
  });

  it('renders a tall Widget as wide (two columns, one row) at 390px', async () => {
    stubViewport(390);
    stub({ widgets: [{ id: 'a', type: 'use-soon', size: 'tall' }] });

    renderWithProviders(<DashboardPage />);

    const card = await screen.findByRole('region', { name: 'Use soon' });
    expect(getComputedStyle(card).gridColumn).toBe('span 2');
    expect(getComputedStyle(card).gridRow).toBe('span 1');
  });

  it.each([
    [390, ''],
    [768, ''],
    [1280, 'dense'],
  ])(
    'packs the grid densely only on the four-column grid (%ipx)',
    async (width, dense) => {
      stubViewport(width);
      stub({ widgets: [{ id: 'a', type: 'budget', size: 'small' }] });

      renderWithProviders(<DashboardPage />);

      const widget = await screen.findByRole('region', { name: 'Budget' });
      const grid = widget.parentElement as HTMLElement;
      expect(getComputedStyle(grid).gridAutoFlow).toBe(dense || 'row');
    },
  );

  it('keeps Customise dashboard as a link to the Customise page', async () => {
    stub({ widgets: [] });

    renderWithProviders(<DashboardPage />);

    expect(
      await screen.findByRole('link', { name: 'Customise dashboard' }),
    ).toHaveAttribute('href', '/customise');
  });

  it('shows Settings as the labelled top-bar action, and Customise not at all in the header', async () => {
    stub({ widgets: [] });

    renderWithProviders(<DashboardPage />);

    const header = await screen.findByRole('banner');
    const links = within(header).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Settings']);
    expect(links[0]).toHaveAttribute('href', '/settings');
  });

  it('shows an error with a retry when the layout cannot be loaded', async () => {
    const { fetchMock } = stubApi({});
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
  });
});

describe('DashboardPage header', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date(2026, 9, 25, 19, 0));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const settle = () =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  const elapse = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  function stubDash(layout: () => Response | Promise<Response>) {
    const { fetchMock, calls } = stubApi({
      'GET /api/dashboard-layout': layout,
      'GET /api/pantry': () => Response.json({ batches: [] }),
      // Pantry Health in the header reads these too, and a refresh refetches them.
      'GET /api/pantry/last-stocked': () =>
        Response.json({ lastStockedAt: null }),
      'GET /api/settings/family': () =>
        Response.json({ staleThresholdDays: 3, expiryOverrides: [] }),
      'GET /api/shopping-list/suggestions': () =>
        Response.json({
          staples: [],
          usedUp: [],
          runningLow: [],
          expired: [],
          dismissed: [],
        }),
      'GET /api/shopping-list': () =>
        Response.json({
          id: 'l',
          groups: [],
          summary: { remaining: 0, checked: 0 },
        }),
      // The voice mic's Credit Price reads the Credits, which the tab-root refresh refetches too.
      'GET /api/credits': () =>
        Response.json({
          balance: 100,
          prices: { voice: 1 },
          lowBalanceThreshold: 10,
          history: [],
        }),
      'GET /api/voice/config': () => Response.json({ configured: true }),
      'GET /api/staples': () => Response.json({ staples: [] }),
      'GET /api/settings/preferences': () => Response.json({}),
    });
    vi.stubGlobal('fetch', fetchMock);
    return calls;
  }
  const tapRefresh = () =>
    act(() => {
      pull(makeScrollable(screen.getByTestId('sheet-scroller')), { to: 200 });
    });
  const layout = () =>
    Response.json({ widgets: [{ id: 'a', type: 'budget', size: 'small' }] });

  it('shows the greeting and the date under it, with Settings the only top-bar action and no logo', async () => {
    stubDash(layout);
    renderInAppLayout(<DashboardPage />, '/');
    await settle();

    expect(
      screen.queryByRole('button', { name: 'Refresh' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Good evening' }),
    ).toBeInTheDocument();
    const header = screen.getByRole('banner');
    expect(header).toHaveTextContent('Sunday, October 25');
    const links = within(header).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Settings']);
    expect(within(header).queryByRole('img')).not.toBeInTheDocument();
  });

  it('puts Customise dashboard under the last Widget, as a link to the Customise page', async () => {
    stubDash(layout);
    renderInAppLayout(<DashboardPage />, '/');
    await settle();

    const link = screen.getByRole('link', { name: 'Customise dashboard' });
    expect(link).toHaveAttribute('href', '/customise');
    expect(
      within(screen.getByRole('banner')).queryByRole('link', {
        name: 'Customise dashboard',
      }),
    ).not.toBeInTheDocument();
    const widget = screen.getByRole('region', { name: 'Budget' });
    expect(
      widget.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('refetches on a pull, saying the outcome off the header and keeping the date under the greeting', async () => {
    const calls = stubDash(layout);
    renderInAppLayout(<DashboardPage />, '/');
    await settle();
    const count = () =>
      calls.filter((c) => c.key === 'GET /api/dashboard-layout').length;
    const before = count();
    const header = screen.getByRole('banner');

    tapRefresh();
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing…');
    expect(header).toHaveTextContent('Sunday, October 25');
    expect(header).not.toHaveTextContent('Refreshing…');
    await elapse(MIN_BUSY_MS);
    expect(screen.getByRole('status')).toHaveTextContent('Updated just now');
    expect(header).toHaveTextContent('Sunday, October 25');
    expect(count()).toBeGreaterThan(before);
    await elapse(2500);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('reports a failed refresh, then clears it', async () => {
    let fail = false;
    stubDash(() => (fail ? Response.error() : layout()));
    renderInAppLayout(<DashboardPage />, '/');
    await settle();
    fail = true;

    tapRefresh();
    await elapse(MIN_BUSY_MS);
    expect(screen.getByRole('status')).toHaveTextContent(
      "Couldn't refresh · showing what you had",
    );
    expect(screen.getByRole('banner')).toHaveTextContent('Sunday, October 25');
    await elapse(4000);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});

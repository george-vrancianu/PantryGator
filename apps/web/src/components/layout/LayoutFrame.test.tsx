import { act, fireEvent, screen } from '@testing-library/react';
import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '../../test/render';
import { makeScrollable, pull, scrollSheetTo } from '../../test/scroll';
import { stubMatchMedia } from '../../test/viewport';
import { AppLayout } from '../AppLayout';
import { Screen } from './Screen';
import { TRANSITION_MS } from './timing';

function BackButton() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Back</button>;
}

function page(title: string, to?: string, withHeader = true) {
  return (
    <Screen
      title={title}
      header={withHeader ? <p>{title} header</p> : undefined}
    >
      {to ? <Link to={to}>to {to}</Link> : null}
      <Link to="/pantry">to /pantry</Link>
      <Link to="/recipes/1">to /recipes/1</Link>
      <BackButton />
      <p>{title} content</p>
    </Screen>
  );
}

function renderRoutes(route: string, extra?: () => void) {
  extra?.();
  return renderWithProviders(
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={page('Home', '/shopping')} />
        <Route path="/pantry" element={page('Pantry', '/shopping')} />
        <Route path="/shopping" element={page('Shopping', '/')} />
        <Route path="/recipes/:id" element={page('Recipe')} />
        <Route
          path="/recipes/new"
          element={page('New recipe', undefined, false)}
        />
        <Route path="/scan" element={<p>camera</p>} />
      </Route>
    </Routes>,
    { route },
  );
}

const slots = (region: 'topBar' | 'header') =>
  document.querySelectorAll(`[data-slot="${region}"]`);
const elapse = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const sheet = () => makeScrollable(screen.getByTestId('sheet-scroller'));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    stubApi({
      'GET /api/voice/config': () => Response.json({ configured: false }),
    }).fetchMock,
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('The layout regions', () => {
  it('puts the top bar and header in their regions and the content in the sheet', () => {
    renderRoutes('/pantry');
    const region = (name: string) =>
      document.querySelector(`[data-region="${name}"]`)!;
    expect(region('top-bar')).toHaveTextContent('Pantry');
    expect(region('header')).toHaveTextContent('Pantry header');
    expect(screen.getByTestId('sheet-scroller')).toHaveTextContent(
      'Pantry content',
    );
    expect(screen.getByTestId('sheet-scroller')).not.toHaveTextContent(
      'Pantry header',
    );
  });

  it('gives an editor the top bar only', () => {
    renderRoutes('/recipes/new');
    expect(slots('topBar')).toHaveLength(1);
    expect(slots('header')).toHaveLength(0);
  });

  it('leaves the camera with no layout at all', () => {
    renderRoutes('/scan');
    expect(screen.getByText('camera')).toBeInTheDocument();
    expect(screen.queryByTestId('app-layout')).toBeNull();
  });

  it('exposes the header as not collapsed', () => {
    renderRoutes('/pantry');
    expect(screen.getByTestId('app-layout')).toHaveAttribute(
      'data-collapsed',
      'false',
    );
  });
});

describe('Page transitions', () => {
  it('keeps both headers mounted for the transition, then unmounts the old one', async () => {
    renderRoutes('/pantry');
    fireEvent.click(screen.getByRole('link', { name: 'to /shopping' }));
    expect(slots('topBar')).toHaveLength(2);
    expect(slots('header')).toHaveLength(2);
    expect(screen.getByText('Pantry header')).toBeInTheDocument();
    expect(screen.getByText('Shopping header')).toBeInTheDocument();
    const [leaving, entering] = [...slots('topBar')];
    expect(leaving).toHaveAttribute('data-phase', 'leaving');
    expect(entering).toHaveAttribute('data-phase', 'entering');

    await elapse(TRANSITION_MS - 1);
    expect(slots('header')).toHaveLength(2);
    await elapse(1);
    expect(slots('topBar')).toHaveLength(1);
    expect(slots('header')).toHaveLength(1);
    expect(screen.queryByText('Pantry header')).toBeNull();
    expect(screen.getByText('Shopping header')).toBeInTheDocument();
    expect(slots('header')[0]).not.toHaveAttribute('data-phase');
  });

  it('holds the outgoing content, faded out, beside the new content', async () => {
    renderRoutes('/pantry');
    fireEvent.click(screen.getByRole('link', { name: 'to /shopping' }));
    expect(screen.getByText('Pantry content')).toBeInTheDocument();
    expect(screen.getByText('Shopping content')).toBeInTheDocument();
    await elapse(TRANSITION_MS);
    expect(screen.queryByText('Pantry content')).toBeNull();
  });

  it('jumps to the newest page when the Member navigates again mid-transition', async () => {
    renderRoutes('/');
    fireEvent.click(screen.getByRole('link', { name: 'to /pantry' }));
    await elapse(100);
    fireEvent.click(screen.getByRole('link', { name: 'to /shopping' }));
    // No queue: the half-shown Pantry is dropped and Shopping stands alone.
    expect(screen.queryByText('Pantry header')).toBeNull();
    expect(screen.queryByText('Home header')).toBeNull();
    expect(slots('topBar')).toHaveLength(1);
    expect(screen.getByText('Shopping header')).toBeInTheDocument();
    await elapse(TRANSITION_MS * 2);
    expect(slots('topBar')).toHaveLength(1);
  });

  it('applies no transition classes or animations under reduced motion', async () => {
    stubMatchMedia((query) => query.includes('prefers-reduced-motion'));
    renderRoutes('/pantry');
    fireEvent.click(screen.getByRole('link', { name: 'to /shopping' }));
    expect(slots('topBar')).toHaveLength(1);
    expect(slots('header')).toHaveLength(1);
    expect(screen.queryByText('Pantry header')).toBeNull();
    expect(document.querySelector('[data-phase]')).toBeNull();
    const regions = document.querySelectorAll('[data-region] > div');
    for (const region of regions)
      expect(getComputedStyle(region).transition).not.toContain('cubic-bezier');
  });

  it('animates the header region to its height with the layout easing', () => {
    renderRoutes('/pantry');
    fireEvent.click(screen.getByRole('link', { name: 'to /shopping' }));
    const region = document.querySelector('[data-region="header"] > div')!;
    expect(getComputedStyle(region).transition).toContain(
      'cubic-bezier(.2,.8,.2,1)',
    );
  });
});

describe('Scrolling', () => {
  it('sizes the layout by the dynamic viewport and scrolls only the sheet', () => {
    renderRoutes('/pantry');
    const layout = screen.getByTestId('app-layout');
    const scroller = screen.getByTestId('sheet-scroller');
    expect(getComputedStyle(layout).overflow).toBe('hidden');
    expect(getComputedStyle(scroller).overflowY).toBe('auto');
    expect(getComputedStyle(scroller).overscrollBehavior).toBe('contain');
  });

  const go = async (name: string) => {
    fireEvent.click(screen.getByRole('link', { name }));
    await elapse(TRANSITION_MS);
  };

  it('keeps the outgoing page where it was while it fades, though the sheet jumps', async () => {
    renderRoutes('/pantry');
    const el = sheet();
    scrollSheetTo(el, 400);
    fireEvent.click(screen.getByRole('link', { name: 'to /recipes/1' }));
    const leaving = screen
      .getByText('Pantry content')
      .closest<HTMLElement>('[data-phase="leaving"]')!;
    expect(el.scrollTop).toBe(0);
    expect(leaving.style.top).toBe('-400px');
    await elapse(TRANSITION_MS);
  });

  it('restores a tab root to where it was left, however it is reached', async () => {
    renderRoutes('/pantry');
    const el = sheet();
    scrollSheetTo(el, 400);
    await go('to /shopping');
    expect(el.scrollTop).toBe(0);
    await go('to /pantry');
    expect(el.scrollTop).toBe(400);
  });

  it('opens a drill-in at the top, even one the Member left scrolled', async () => {
    renderRoutes('/pantry');
    const el = sheet();
    scrollSheetTo(el, 400);
    await go('to /recipes/1');
    expect(el.scrollTop).toBe(0);
    scrollSheetTo(el, 90);
    await go('to /pantry');
    await go('to /recipes/1');
    expect(el.scrollTop).toBe(0);
  });

  it('restores the position of the page Back returns to', async () => {
    renderRoutes('/pantry');
    const el = sheet();
    scrollSheetTo(el, 400);
    await go('to /recipes/1');
    scrollSheetTo(el, 90);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await elapse(TRANSITION_MS);
    expect(el.scrollTop).toBe(400);
  });

  it('leaves the window alone', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    renderRoutes('/pantry');
    scrollSheetTo(sheet(), 300);
    await go('to /recipes/1');
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe('Pull to refresh', () => {
  const openAt = (route: string) => Promise.resolve(renderRoutes(route));

  it('refreshes the active queries from the top of the sheet', async () => {
    const { queryClient } = await openAt('/pantry');
    const refetch = vi.spyOn(queryClient, 'refetchQueries');
    const el = sheet();
    act(() => pull(el, { to: 200 }));
    expect(refetch).toHaveBeenCalledWith({ type: 'active' });
    expect(
      screen.getByTestId('refresh-loader').getAttribute('data-shown'),
    ).toBe('true');
    await elapse(1000);
  });

  it('does nothing when the sheet is not at the top', async () => {
    const { queryClient } = await openAt('/pantry');
    const refetch = vi.spyOn(queryClient, 'refetchQueries');
    const el = sheet();
    scrollSheetTo(el, 50);
    act(() => pull(el, { to: 200 }));
    expect(refetch).not.toHaveBeenCalled();
  });

  it('leaves a horizontal swipe alone: no refresh and no preventDefault', async () => {
    const { queryClient } = await openAt('/pantry');
    const refetch = vi.spyOn(queryClient, 'refetchQueries');
    const move = pull(sheet(), { from: 100, to: 180, fromX: 300, toX: 100 });
    expect(move.defaultPrevented).toBe(false);
    expect(refetch).not.toHaveBeenCalled();
  });

  it('prevents the browser default once a pull is clearly vertical', async () => {
    await openAt('/pantry');
    const move = pull(sheet(), { to: 200 });
    expect(move.defaultPrevented).toBe(true);
  });

  it('does not start from inside an inner scroller that is scrolled down', async () => {
    const { queryClient } = await openAt('/pantry');
    const refetch = vi.spyOn(queryClient, 'refetchQueries');
    const el = sheet();
    const inner = document.createElement('div');
    inner.style.overflowY = 'auto';
    Object.defineProperty(inner, 'scrollHeight', { value: 500 });
    Object.defineProperty(inner, 'clientHeight', { value: 100 });
    inner.scrollTop = 40;
    el.firstElementChild!.appendChild(inner);
    const move = pull(el, { to: 200, target: inner });
    expect(move.defaultPrevented).toBe(false);
    expect(refetch).not.toHaveBeenCalled();
  });

  it('does nothing on a short pull', async () => {
    const { queryClient } = await openAt('/pantry');
    const refetch = vi.spyOn(queryClient, 'refetchQueries');
    act(() => pull(sheet(), { to: 120 }));
    expect(refetch).not.toHaveBeenCalled();
  });

  it('does nothing in an editor', async () => {
    const { queryClient } = await openAt('/recipes/new');
    const refetch = vi.spyOn(queryClient, 'refetchQueries');
    act(() => pull(sheet(), { to: 300 }));
    expect(refetch).not.toHaveBeenCalled();
    expect(
      screen.getByTestId('refresh-loader').getAttribute('data-shown'),
    ).toBe('false');
  });

  it('only dims the content while it refreshes, not the top bar', async () => {
    await openAt('/pantry');
    act(() => pull(sheet(), { to: 200 }));
    expect(getComputedStyle(screen.getByTestId('sheet-content')).opacity).toBe(
      '0.55',
    );
    const bar = document.querySelector('[data-slot="topBar"]')!;
    expect(getComputedStyle(bar).opacity).not.toBe('0.55');
    await elapse(1000);
  });
});

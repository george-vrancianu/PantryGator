import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createBrowserRouter,
  Link,
  RouterProvider,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLeaveGuard } from './useLeaveGuard';

/** The router the app really uses: a data router on the browser's real history. */
let ask = false;

function Form() {
  const navigate = useNavigate();
  useLeaveGuard(() => ask, 'Leave?');
  return (
    <>
      <p>form</p>
      <Link to="/other">other</Link>
      <button type="button" onClick={() => navigate(-1)}>
        go back
      </button>
      <button type="button" onClick={() => navigate('/other')}>
        go other
      </button>
      <button
        type="button"
        onClick={() => {
          // A save: the unsaved work is cleared and the page leaves in the same tick.
          ask = false;
          navigate('/other');
        }}
      >
        save and leave
      </button>
      <button
        type="button"
        onClick={() => navigate('/form?draft=1', { replace: true })}
      >
        add draft id
      </button>
    </>
  );
}

function Page({ name }: { name: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <p>{`${name} at ${location.pathname}${location.search}`}</p>
      <button type="button" onClick={() => navigate('/form')}>
        open form
      </button>
    </>
  );
}

let router: ReturnType<typeof createBrowserRouter> | undefined;

const mount = async () => {
  window.history.replaceState(null, '', '/start');
  router = createBrowserRouter([
    { path: '/start', element: <Page name="start" /> },
    { path: '/form', element: <Form /> },
    { path: '/other', element: <Page name="other" /> },
  ]);
  render(<RouterProvider router={router} />);
  await userEvent.click(screen.getByRole('button', { name: 'open form' }));
  await screen.findByText('form');
};

describe('useLeaveGuard on a data router', () => {
  let confirm: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    ask = false;
    confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  });
  afterEach(() => {
    confirm.mockRestore();
    router?.dispose();
    router = undefined;
  });

  it('lets everything through while nothing is unsaved', async () => {
    await mount();
    await userEvent.click(screen.getByRole('link', { name: 'other' }));
    expect(await screen.findByText('other at /other')).toBeVisible();
    expect(confirm).not.toHaveBeenCalled();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  });

  it('asks before a link, and stays or goes by the answer', async () => {
    await mount();
    ask = true;
    await userEvent.click(screen.getByRole('link', { name: 'other' }));
    expect(confirm).toHaveBeenCalledWith('Leave?');
    expect(screen.getByText('form')).toBeVisible();
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('link', { name: 'other' }));
    expect(await screen.findByText('other at /other')).toBeVisible();
  });

  it('does not ask when the address only gains its draft id (a replace on the same path)', async () => {
    await mount();
    ask = true;
    await userEvent.click(screen.getByRole('button', { name: 'add draft id' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?draft=1');
  });

  it('asks on the browser Back button and puts the page back when declined', async () => {
    await mount();
    ask = true;
    act(() => window.history.back());
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    // The router blocks the pop, the guard declines, and the router resets it.
    await waitFor(() => expect(window.location.pathname).toBe('/form'));
    expect(screen.getByText('form')).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('goes back when the Member agrees', async () => {
    await mount();
    ask = true;
    confirm.mockReturnValue(true);
    act(() => window.history.back());
    expect(await screen.findByText('start at /start')).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('asks on unload, and takes its hold off the router when the form goes', async () => {
    await mount();
    ask = true;
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('link', { name: 'other' }));
    await screen.findByText('other at /other');
    confirm.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'open form' }));
    await screen.findByText('form');
    // Gone and back: one guard, not two.
    await userEvent.click(screen.getByRole('link', { name: 'other' }));
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('asks exactly once for navigate(-1), and goes back when the Member agrees', async () => {
    await mount();
    ask = true;
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'go back' }));
    expect(await screen.findByText('start at /start')).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('asks for navigate(...), staying on decline and leaving on accept', async () => {
    await mount();
    ask = true;
    await userEvent.click(screen.getByRole('button', { name: 'go other' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByText('form')).toBeVisible();
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'go other' }));
    expect(await screen.findByText('other at /other')).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('keeps the page when navigate(-1) is declined', async () => {
    await mount();
    ask = true;
    await userEvent.click(screen.getByRole('button', { name: 'go back' }));
    // The router undoes a declined Back asynchronously, as the browser's history does.
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.location.pathname).toBe('/form'));
    expect(screen.getByText('form')).toBeVisible();
  });

  it('does not ask when a save clears the unsaved work and leaves in the same tick', async () => {
    await mount();
    ask = true;
    await userEvent.click(
      screen.getByRole('button', { name: 'save and leave' }),
    );
    expect(await screen.findByText('other at /other')).toBeVisible();
    expect(confirm).not.toHaveBeenCalled();
  });
});

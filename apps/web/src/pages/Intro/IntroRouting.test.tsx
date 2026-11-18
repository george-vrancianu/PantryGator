import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { renderWithProviders, stubApi } from '@/test/render';

type Options = { signedIn?: boolean; introDone?: boolean };

/** A stubbed API where Log in works, and the session and Preferences follow whether the Member signed in. */
function stubIntroApi({ signedIn = false, introDone = true }: Options = {}) {
  let session = signedIn;
  const { fetchMock, calls } = stubApi({
    'GET /api/auth/get-session': () =>
      session
        ? Response.json({
            user: { id: '1', name: 'Ana', email: 'ana@example.com' },
          })
        : new Response('null'),
    'POST /api/auth/sign-in/email': () => {
      session = true;
      return Response.json({ user: { id: '1' } });
    },
    'GET /api/settings/preferences': () =>
      Response.json({ introDone, theme: null, locale: 'en' }),
    'PUT /api/settings/preferences': () =>
      Response.json({ introDone: true, theme: null, locale: 'en' }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

describe('the Intro shell routing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['/', '/pantry', '/shopping?x=1'])(
    'opens Launch for a signed-out visitor at %s',
    async (route) => {
      stubIntroApi();
      renderWithProviders(<App />, { route });
      expect(
        await screen.findByRole('heading', { name: 'PantryGator' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute(
        'href',
        '/intro/languages',
      );
    },
  );

  it('opens Log in from "I already have an account"', async () => {
    stubIntroApi();
    renderWithProviders(<App />, { route: '/pantry' });
    await userEvent
      .setup()
      .click(
        await screen.findByRole('link', { name: 'I already have an account' }),
      );
    expect(
      await screen.findByRole('heading', { name: 'Welcome back' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/forgot/i)).toBeNull();
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute(
      'href',
      '/intro/languages',
    );
  });

  it('returns to the deep-linked page, query included, after Log in', async () => {
    stubIntroApi();
    renderWithProviders(<App />, { route: '/shopping?x=1' });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('link', { name: 'I already have an account' }),
    );
    await user.type(await screen.findByLabelText(/^Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(
      await screen.findByRole('heading', { name: 'Shopping', level: 1 }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole(
        'link',
        { name: 'Shopping' },
      ),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('takes a Member who is done with the Intro straight to the page they opened', async () => {
    stubIntroApi({ signedIn: true, introDone: true });
    renderWithProviders(<App />, { route: '/pantry' });
    expect(
      await screen.findByRole('heading', { name: 'Pantry', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Fill your Pantry with Gator?')).toBeNull();
  });

  it.each(['/', '/pantry'])(
    'routes a Member who is not done to Set up or skip from %s',
    async (route) => {
      stubIntroApi({ signedIn: true, introDone: false });
      renderWithProviders(<App />, { route });
      expect(
        await screen.findByRole('heading', {
          name: 'Fill your Pantry with Gator?',
        }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    },
  );

  it.each([
    '/intro/snap',
    '/intro/say-it',
    '/intro/all-set',
    '/intro/review/x',
  ])(
    'resumes Setup at Set up or skip when %s is opened fresh',
    async (route) => {
      stubIntroApi({ signedIn: true, introDone: false });
      renderWithProviders(<App />, { route });
      expect(
        await screen.findByRole('heading', {
          name: 'Fill your Pantry with Gator?',
        }),
      ).toBeInTheDocument();
    },
  );

  it('marks the Member done and lands on the Dashboard when they skip', async () => {
    const calls = stubIntroApi({ signedIn: true, introDone: false });
    renderWithProviders(<App />, { route: '/pantry' });
    await userEvent
      .setup()
      .click(
        await screen.findByRole('button', { name: /Skip, take me to the app/ }),
      );
    expect(
      await screen.findByRole('link', { name: 'Settings' }),
    ).toBeInTheDocument();
    expect(
      calls.find((c) => c.key === 'PUT /api/settings/preferences')?.body,
    ).toEqual({ introDone: true });
  });

  it.each([true, false])(
    'keeps a signed-in Member (done: %s) off Languages',
    async (introDone) => {
      stubIntroApi({ signedIn: true, introDone });
      renderWithProviders(<App />, { route: '/intro/languages' });
      if (introDone) {
        expect(
          await screen.findByRole('link', { name: 'Settings' }),
        ).toBeInTheDocument();
      } else {
        expect(
          await screen.findByRole('heading', {
            name: 'Fill your Pantry with Gator?',
          }),
        ).toBeInTheDocument();
      }
      expect(screen.queryByRole('radiogroup')).toBeNull();
    },
  );

  it('lets the app through when Preferences cannot be read, and keeps it through a refetch', async () => {
    let reads = 0;
    const { fetchMock, calls } = stubApi({
      'GET /api/auth/get-session': () =>
        Response.json({
          user: { id: '1', name: 'Ana', email: 'ana@example.com' },
        }),
      'GET /api/settings/preferences': () => {
        reads += 1;
        // The refetch after the first failure never answers, so a spinner would stay up.
        if (reads > 1) return new Promise<Response>(() => undefined);
        return Response.json({ code: 'unknown', params: {} }, { status: 500 });
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<App />, { route: '/' });
    expect(
      await screen.findByRole('link', { name: 'Settings' }),
    ).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(reads).toBe(2));
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(
      calls.filter((c) => c.key === 'GET /api/settings/preferences').length,
    ).toBeLessThanOrEqual(2);
  });

  it('keeps the deep link when Log in is left by Back and opened again', async () => {
    stubIntroApi();
    renderWithProviders(<App />, { route: '/shopping?x=1' });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('link', { name: 'I already have an account' }),
    );
    await user.click(await screen.findByRole('link', { name: /back/i }));
    await user.click(
      await screen.findByRole('link', { name: 'I already have an account' }),
    );
    await user.type(await screen.findByLabelText(/^Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(
      await screen.findByRole('heading', { name: 'Shopping', level: 1 }),
    ).toBeInTheDocument();
  });

  it('keeps a done Member off the Intro screens', async () => {
    stubIntroApi({ signedIn: true, introDone: true });
    renderWithProviders(<App />, { route: '/intro/setup' });
    expect(
      await screen.findByRole('navigation', { name: 'Main' }),
    ).toBeInTheDocument();
  });
});

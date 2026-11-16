import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { INTRO_LANGUAGES_STORAGE_KEY } from '../../lib/intro';
import { renderWithProviders, stubApi } from '../../test/render';

type Options = {
  phone?: string[];
  savePreferences?: 'works' | 'fails';
  signedIn?: boolean;
  introDone?: boolean;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** A stubbed API where sign-up creates a Member who is not done with the Intro yet. */
function stubFlow({
  phone = ['en-GB'],
  savePreferences = 'works',
  signedIn = false,
  introDone = false,
}: Options = {}) {
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(phone);
  let session = signedIn;
  let done = introDone;
  const { fetchMock, calls } = stubApi({
    'GET /api/auth/get-session': () =>
      session
        ? Response.json({
            user: { id: '1', name: 'Ana', email: 'ana@example.com' },
          })
        : new Response('null'),
    'POST /api/auth/sign-up/email': () => {
      session = true;
      return Response.json({ user: { id: '1' } });
    },
    'GET /api/settings/preferences': () =>
      Response.json({ introDone: done, theme: null, locale: 'en' }),
    'PUT /api/settings/preferences': () => {
      if (savePreferences === 'fails')
        return Response.json({ code: 'unknown', params: {} }, { status: 500 });
      const body = calls.at(-1)?.body;
      done = done || (isObject(body) && body.introDone === true);
      return Response.json({ introDone: done, theme: null, locale: 'en' });
    },
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const preferenceSaves = (calls: ReturnType<typeof stubFlow>) =>
  calls
    .filter((call) => call.key === 'PUT /api/settings/preferences')
    .map((call) => call.body);

describe('the Intro flow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('goes Launch, Languages, Sign-up, Skip, Dashboard and saves only the picked languages', async () => {
    const calls = stubFlow();
    renderWithProviders(<App />, { route: '/' });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('link', { name: 'Get started' }));
    const receipts = await screen.findByRole('radiogroup', {
      name: 'Receipts & labels',
    });
    await user.click(within(receipts).getByRole('radio', { name: 'Română' }));
    await user.click(screen.getByRole('link', { name: 'Continue' }));

    await user.type(await screen.findByLabelText(/^Name/), 'Ana');
    await user.type(screen.getByLabelText(/^Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await user.click(
      await screen.findByRole('button', { name: /Skip, take me to the app/ }),
    );
    expect(
      await screen.findByRole('link', { name: 'Customise dashboard' }),
    ).toBeInTheDocument();

    // The rows left on "Same" are not in the body, so they store nothing.
    expect(preferenceSaves(calls)).toEqual([
      { locale: 'en', scanLanguage: 'ro' },
      { introDone: true },
    ]);
    expect(localStorage.getItem(INTRO_LANGUAGES_STORAGE_KEY)).toBeNull();
  });

  it('saves all four picked languages', async () => {
    const calls = stubFlow();
    renderWithProviders(<App />, { route: '/intro/languages' });
    const user = userEvent.setup();

    await user.click(
      within(
        await screen.findByRole('radiogroup', { name: 'Voice Notes' }),
      ).getByRole('radio', { name: 'Dansk' }),
    );
    await user.click(
      within(
        screen.getByRole('radiogroup', { name: 'Receipts & labels' }),
      ).getByRole('radio', { name: 'Română' }),
    );
    await user.click(
      within(
        screen.getByRole('radiogroup', { name: 'Grocery names' }),
      ).getByRole('radio', { name: 'Română' }),
    );
    await user.click(screen.getByRole('link', { name: 'Continue' }));
    await user.type(await screen.findByLabelText(/^Name/), 'Ana');
    await user.type(screen.getByLabelText(/^Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', {
      name: 'Fill your Pantry with Gator?',
    });

    expect(preferenceSaves(calls)).toEqual([
      {
        locale: 'en',
        spokenLanguage: 'da',
        scanLanguage: 'ro',
        catalogLanguage: 'ro',
      },
    ]);
  });

  it('does not block the Member when the languages cannot be saved, and says what they chose', async () => {
    stubFlow({ savePreferences: 'fails' });
    renderWithProviders(<App />, { route: '/intro/languages' });
    const user = userEvent.setup();

    await user.click(
      within(
        await screen.findByRole('radiogroup', { name: 'Receipts & labels' }),
      ).getByRole('radio', { name: 'Română' }),
    );
    await user.click(screen.getByRole('link', { name: 'Continue' }));
    await user.type(await screen.findByLabelText(/^Name/), 'Ana');
    await user.type(screen.getByLabelText(/^Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Fill your Pantry with Gator?',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "We couldn't save your languages. You chose App language: English, Receipts & labels: Română. You can set them again in Settings.",
      ),
    ).toBeInTheDocument();
    expect(localStorage.getItem(INTRO_LANGUAGES_STORAGE_KEY)).toBeNull();
  });

  describe('Languages', () => {
    it('preselects the phone language and says so', async () => {
      stubFlow({ phone: ['fr-FR', 'ro-RO'] });
      renderWithProviders(<App />, { route: '/intro/languages' });

      expect(
        await screen.findByRole('heading', { name: 'Limbile tale' }),
      ).toBeInTheDocument();
      const app = screen.getByRole('radiogroup', { name: 'Limba aplicației' });
      expect(within(app).getByRole('radio', { name: 'Română' })).toBeChecked();
      expect(
        screen.getByText('Aleasă după limba telefonului tău'),
      ).toBeInTheDocument();
      expect(
        screen.getAllByRole('radio', { name: 'La fel · Română' }),
      ).toHaveLength(3);
    });

    it('falls back to English without claiming the phone chose it', async () => {
      stubFlow({ phone: ['fr-FR'] });
      renderWithProviders(<App />, { route: '/intro/languages' });

      const app = await screen.findByRole('radiogroup', {
        name: 'App language',
      });
      expect(within(app).getByRole('radio', { name: 'English' })).toBeChecked();
      expect(screen.queryByText(/phone's language/)).toBeNull();
    });

    it('has real radio groups, each language in its own name with its own lang', async () => {
      stubFlow();
      renderWithProviders(<App />, { route: '/intro/languages' });

      const groups = await screen.findAllByRole('radiogroup');
      expect(
        groups.map((g) => g.getAttribute('aria-labelledby')),
      ).not.toContain(null);
      expect(groups).toHaveLength(4);
      const app = screen.getByRole('radiogroup', { name: 'App language' });
      for (const [name, lang] of [
        ['English', 'en'],
        ['Română', 'ro'],
        ['Dansk', 'da'],
      ] as const) {
        const radio = within(app).getByRole('radio', { name });
        expect(radio).toHaveAttribute('type', 'radio');
        expect(radio.closest('label')).toHaveAttribute('lang', lang);
      }
      const same = within(
        screen.getByRole('radiogroup', { name: 'Grocery names' }),
      ).getByRole('radio', { name: 'Same · English' });
      expect(same).toBeChecked();
      expect(
        within(same.closest('label') as HTMLElement).getByText('English'),
      ).toHaveAttribute('lang', 'en');
    });

    it('moves and picks with the arrow keys, and switches the Intro language at once', async () => {
      stubFlow();
      renderWithProviders(<App />, { route: '/intro/languages' });
      const user = userEvent.setup();

      const app = await screen.findByRole('radiogroup', {
        name: 'App language',
      });
      await user.click(within(app).getByRole('radio', { name: 'English' }));
      await user.keyboard('{ArrowDown}');

      expect(
        await screen.findByRole('heading', { name: 'Limbile tale' }),
      ).toBeInTheDocument();
      expect(
        within(
          screen.getByRole('radiogroup', { name: 'Limba aplicației' }),
        ).getByRole('radio', { name: 'Română' }),
      ).toBeChecked();
      expect(document.documentElement.lang).toBe('ro');
    });

    it('keeps the picks on the device while the Member goes on, and follows the App pick on Same rows', async () => {
      stubFlow();
      renderWithProviders(<App />, { route: '/intro/languages' });
      const user = userEvent.setup();

      const app = await screen.findByRole('radiogroup', {
        name: 'App language',
      });
      await user.click(within(app).getByRole('radio', { name: 'Dansk' }));

      expect(
        await screen.findAllByRole('radio', { name: 'Samme · Dansk' }),
      ).toHaveLength(3);
      expect(
        JSON.parse(localStorage.getItem(INTRO_LANGUAGES_STORAGE_KEY) ?? '{}'),
      ).toEqual({
        locale: 'da',
        spokenLanguage: null,
        scanLanguage: null,
        catalogLanguage: null,
      });
    });

    it('is the light look and has no dark version', async () => {
      stubFlow();
      renderWithProviders(<App />, { route: '/intro/languages' });
      await screen.findByRole('radiogroup', { name: 'App language' });
      expect(document.querySelector('[data-theme="light"]')).not.toBeNull();
    });
  });

  describe('resuming and returning', () => {
    it.each(['/scan', '/shopping'])(
      'sends a Member who is not done to Set up or skip when they come back at %s',
      async (route) => {
        stubFlow({ signedIn: true });
        renderWithProviders(<App />, { route });
        expect(
          await screen.findByRole('heading', {
            name: 'Fill your Pantry with Gator?',
          }),
        ).toBeInTheDocument();
      },
    );

    it('keeps "Show the intro again" out of Settings for a done Member', async () => {
      stubFlow({ signedIn: true, introDone: true });
      renderWithProviders(<App />, { route: '/settings' });
      expect(
        await screen.findByRole('navigation', { name: 'Main' }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/show the intro again/i)).toBeNull();
    });

    it('has no "Forgot password?" on sign-up', async () => {
      stubFlow();
      renderWithProviders(<App />, { route: '/sign-up' });
      await screen.findByLabelText(/^Password/);
      expect(screen.queryByText(/forgot/i)).toBeNull();
      expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute(
        'href',
        '/intro/languages',
      );
    });
  });
});

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders, stubApi } from '@/test/render';
import { SignInPage } from './SignInPage';

const signedOut = () => new Response('null');
const wrongPassword = () =>
  Response.json(
    { code: 'auth.invalid_email_or_password', params: {} },
    { status: 401 },
  );

function renderSignIn(locale: 'en' | 'ro' = 'en') {
  return renderWithProviders(
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/" element={<p>Dashboard reached</p>} />
    </Routes>,
    { route: '/sign-in', locale },
  );
}

async function fillAndSubmit(email: string, password: string, submit: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/^(email|e-mail)/i), email);
  await user.type(screen.getByLabelText(/^(password|parolă)/i), password);
  await user.click(screen.getByRole('button', { name: submit }));
}

describe('SignInPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('signs in with the typed credentials and moves on to the dashboard', async () => {
    let signedIn = false;
    const { fetchMock, calls } = stubApi({
      'POST /api/auth/sign-in/email': () => {
        signedIn = true;
        return Response.json({ user: { id: '1' } });
      },
      'GET /api/auth/get-session': () =>
        signedIn
          ? Response.json({
              user: { id: '1', name: 'Ana', email: 'ana@example.com' },
            })
          : signedOut(),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderSignIn();

    await fillAndSubmit('ana@example.com', 'correct-horse', 'Log in');

    expect(await screen.findByText('Dashboard reached')).toBeInTheDocument();
    expect(
      calls.find((c) => c.key === 'POST /api/auth/sign-in/email')?.body,
    ).toEqual({
      email: 'ana@example.com',
      password: 'correct-horse',
    });
  });

  it('shows a localised message for a wrong password and stays on the page', async () => {
    const { fetchMock } = stubApi({
      'POST /api/auth/sign-in/email': wrongPassword,
      'GET /api/auth/get-session': signedOut,
    });
    vi.stubGlobal('fetch', fetchMock);
    renderSignIn();

    await fillAndSubmit('ana@example.com', 'nope', 'Log in');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Wrong email or password.',
    );
    expect(screen.queryByText('Dashboard reached')).not.toBeInTheDocument();
  });

  it('shows the wrong-password message in Romanian', async () => {
    const { fetchMock } = stubApi({
      'POST /api/auth/sign-in/email': wrongPassword,
      'GET /api/auth/get-session': signedOut,
    });
    vi.stubGlobal('fetch', fetchMock);
    renderSignIn('ro');

    await fillAndSubmit('ana@example.com', 'nope', 'Autentificare');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'E-mail sau parolă greșită.',
    );
  });

  it('explains a network failure instead of failing silently', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.reject(new TypeError('Failed to fetch')),
    );
    renderSignIn();

    await fillAndSubmit('ana@example.com', 'pw', 'Log in');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not reach the server/i,
    );
  });

  it('re-renders everything in Romanian when the language is switched', async () => {
    const { fetchMock } = stubApi({ 'GET /api/auth/get-session': signedOut });
    vi.stubGlobal('fetch', fetchMock);
    renderSignIn();
    expect(
      screen.getByRole('heading', { name: 'Welcome back' }),
    ).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'RO' }));

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Bine ai revenit' }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: 'Autentificare' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Începe' })).toHaveAttribute(
      'href',
      '/intro/languages',
    );
  });
});

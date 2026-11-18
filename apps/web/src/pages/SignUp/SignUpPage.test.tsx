import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { renderWithProviders, stubApi } from '@/test/render';

afterEach(() => vi.unstubAllGlobals());

function stub(
  promoCodeRequired: boolean,
  signUp: () => Response = () => Response.json({}),
) {
  const api = stubApi({
    'GET /api/auth/get-session': () => Response.json(null),
    'GET /api/signup-config': () => Response.json({ promoCodeRequired }),
    'POST /api/auth/sign-up/email': signUp,
  });
  vi.stubGlobal('fetch', api.fetchMock);
  return api;
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/^Name/), 'Ana');
  await user.type(screen.getByLabelText(/^Email/), 'ana@example.com');
  await user.type(screen.getByLabelText(/^Password/), 'long-enough-1');
}

describe('SignUpPage Promo Code field', () => {
  it('requires a Promo Code when the deploy asks for one', async () => {
    const { calls } = stub(true);
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/sign-up' });
    const field = await screen.findByLabelText(/^Promo Code/);
    expect(field).toBeRequired();
    expect(screen.queryByText('Have a Promo Code?')).toBeNull();
    await fill(user);
    await user.type(field, 'abcde-fghjk');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/auth/sign-up/email')?.body,
      ).toEqual({
        name: 'Ana',
        email: 'ana@example.com',
        password: 'long-enough-1',
        promoCode: 'abcde-fghjk',
      }),
    );
  });

  it('offers an optional field otherwise, and sends no code when it is empty', async () => {
    const { calls } = stub(false);
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/sign-up' });
    const field = await screen.findByLabelText('Have a Promo Code?');
    expect(field).not.toBeRequired();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/auth/sign-up/email')?.body,
      ).toEqual({
        name: 'Ana',
        email: 'ana@example.com',
        password: 'long-enough-1',
      }),
    );
  });

  it('shows a Promo Code refusal on the Promo Code field', async () => {
    stub(true, () =>
      Response.json(
        { code: 'promo_code.already_redeemed', params: {} },
        { status: 409 },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/sign-up' });
    await fill(user);
    await user.type(screen.getByLabelText(/^Promo Code/), 'ABCDEFGHJK');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    const field = await screen.findByLabelText(/^Promo Code/);
    await waitFor(() => expect(field).toBeInvalid());
    expect(
      screen.getByText('That Promo Code has already been used.'),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps other refusals in the form alert, not on the field', async () => {
    stub(false, () =>
      Response.json(
        { code: 'auth.user_already_exists', params: {} },
        { status: 422 },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/sign-up' });
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('alert');
    expect(await screen.findByLabelText('Have a Promo Code?')).toBeValid();
  });
});

describe('SignUpPage join toggle', () => {
  const join = (user: ReturnType<typeof userEvent.setup>) =>
    screen
      .findByRole('button', { name: 'Join an existing Family' })
      .then((radio) => user.click(radio));

  it('creates a Family by default', async () => {
    stub(true);
    renderWithProviders(<App />, { route: '/sign-up' });
    expect(await screen.findByLabelText(/^Promo Code/)).toBeVisible();
    expect(screen.queryByLabelText(/^Invite Code/)).toBeNull();
  });

  it('swaps the Promo Code field for an Invite Code field while a code is required', async () => {
    const { calls } = stub(true);
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/sign-up' });
    await screen.findByLabelText(/^Promo Code/);
    await join(user);
    expect(screen.queryByLabelText(/^Promo Code/)).toBeNull();
    await fill(user);
    await user.type(screen.getByLabelText(/^Invite Code/), ' abcd2345 ');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/auth/sign-up/email')?.body,
      ).toEqual({
        name: 'Ana',
        email: 'ana@example.com',
        password: 'long-enough-1',
        joinInviteCode: 'abcd2345',
      }),
    );
  });

  it('keeps an optional Promo Code field beside the Invite Code while signup is open', async () => {
    stub(false);
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/sign-up' });
    await screen.findByLabelText('Have a Promo Code?');
    await join(user);
    expect(screen.getByLabelText(/^Invite Code/)).toBeRequired();
    expect(screen.getByLabelText('Have a Promo Code?')).toBeVisible();
  });

  it('shows an Invite Code refusal on the Invite Code field', async () => {
    stub(true, () =>
      Response.json(
        { code: 'family.invite_code_expired', params: {} },
        { status: 410 },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/sign-up' });
    await screen.findByLabelText(/^Promo Code/);
    await join(user);
    await fill(user);
    await user.type(screen.getByLabelText(/^Invite Code/), 'ABCD2345');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() =>
      expect(screen.getByLabelText(/^Invite Code/)).toBeInvalid(),
    );
    expect(
      screen.getByText(
        'That Invite Code has expired. Ask the Owner for a new one.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sends both codes when joining while signup is open', async () => {
    const { calls } = stub(false);
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/sign-up' });
    await screen.findByLabelText('Have a Promo Code?');
    await join(user);
    await fill(user);
    await user.type(screen.getByLabelText(/^Invite Code/), 'ABCD2345');
    await user.type(screen.getByLabelText('Have a Promo Code?'), 'ABCDEFGHJK');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/auth/sign-up/email')?.body,
      ).toEqual({
        name: 'Ana',
        email: 'ana@example.com',
        password: 'long-enough-1',
        promoCode: 'ABCDEFGHJK',
        joinInviteCode: 'ABCD2345',
      }),
    );
  });

  it('shows a Promo Code typed as the Invite Code on the Invite Code field', async () => {
    stub(true, () =>
      Response.json(
        { code: 'family.invite_code_is_promo_code', params: {} },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/sign-up' });
    await screen.findByLabelText(/^Promo Code/);
    await join(user);
    await fill(user);
    await user.type(screen.getByLabelText(/^Invite Code/), 'ABCDEFGHJK');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() =>
      expect(screen.getByLabelText(/^Invite Code/)).toBeInvalid(),
    );
    expect(
      screen.getByText(/That is a Promo Code, not an Invite Code/),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('tells a Promo Code field holding an Invite Code to use the Join toggle, not the Family tab', async () => {
    stub(false, () =>
      Response.json(
        { code: 'promo_code.is_invite_code', params: {} },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/sign-up' });
    await screen.findByLabelText(/^Promo Code|^Have a Promo Code/);
    await fill(user);
    await user.type(screen.getByLabelText('Have a Promo Code?'), 'ABCD2345');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByText(/Choose Join an existing Family/),
    ).toBeVisible();
    expect(screen.queryByText(/Family tab/)).toBeNull();
  });

  it('keeps a family.* refusal in the form alert while creating a Family', async () => {
    stub(false, () =>
      Response.json(
        { code: 'family.rate_limited', params: {} },
        { status: 429 },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/sign-up' });
    await screen.findByLabelText('Have a Promo Code?');
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('alert');
    expect(screen.queryByLabelText(/^Invite Code/)).toBeNull();
  });
});

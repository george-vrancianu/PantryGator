import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  linkReadsOf,
  recipeReads,
  MAX_HELD_RECIPE_READS,
} from '../../lib/recipeReads';
import { MAX_PASTED_TEXT_LENGTH } from '../../lib/linkRecipe';
import { renderWithProviders, stubApi } from '../../test/render';
import { stubViewport } from '../../test/viewport';
import {
  FromTextSheet,
  type FromTextPrefill,
} from './components/FromTextSheet';

const pending = new Promise<Response>(() => {});

function setup(
  options: { prefill?: FromTextPrefill; unreadable?: boolean } = {},
) {
  const onClose = vi.fn();
  const { fetchMock, calls } = stubApi({
    'POST /api/recipes/from-link': () =>
      options.unreadable
        ? Response.json(
            { code: 'link.unreadable', params: {} },
            { status: 502 },
          )
        : pending,
    'GET /api/credits': () =>
      Response.json({
        balance: 100,
        prices: { 'link-page': 2, 'link-text': 1 },
        lowBalanceThreshold: 10,
        history: [],
      }),
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <FromTextSheet open onClose={onClose} prefill={options.prefill} />,
  );
  return { onClose, calls };
}

type User = ReturnType<typeof userEvent.setup>;

/** userEvent installs its own clipboard on navigator; replace readText after setup. */
function clipboardReads(user: User, read: () => Promise<string> | string) {
  vi.spyOn(navigator.clipboard, 'readText').mockImplementation(async () =>
    read(),
  );
  return user;
}

const field = () => screen.getByLabelText(/^Recipe text/);
const pasteButton = () =>
  screen.queryByRole('button', { name: 'Paste from clipboard' });
const clearButton = () => screen.queryByRole('button', { name: 'Clear' });

beforeEach(() => recipeReads.clear());
afterEach(() => {
  cleanup();
  recipeReads.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('"From text" sheet', () => {
  it('is a text-only sheet with the text hint, Reading Language and Credit Price', async () => {
    setup();
    expect(
      await screen.findByRole('dialog', { name: 'From text' }),
    ).toBeVisible();
    expect(screen.getByText(/Paste the text of a recipe/)).toBeVisible();
    expect(
      screen.getByRole('radio', { name: "Keep the text's language" }),
    ).toBeVisible();
    const line = await screen.findByText(/Reading pasted text costs/);
    expect(line).toBeVisible();
    expect(within(line).getByText('1 Credit')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Link to the recipe/)).toBeNull();
    expect(screen.queryByRole('button', { name: /instead/ })).toBeNull();
  });

  describe('Paste from clipboard', () => {
    it('replaces the content and focuses the field', async () => {
      const user = userEvent.setup({ delay: null });
      setup();
      await user.type(field(), 'old');
      clipboardReads(user, () => '2 eggs, whisk');
      await user.click(pasteButton()!);
      await waitFor(() => expect(field()).toHaveValue('2 eggs, whisk'));
      expect(field()).toHaveFocus();
    });

    it('is hidden when the clipboard API cannot read', async () => {
      userEvent.setup({ delay: null });
      vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
      setup();
      await screen.findByRole('dialog', { name: 'From text' });
      expect(pasteButton()).toBeNull();
    });

    it('leaves the field and says so when the read is refused', async () => {
      const user = userEvent.setup({ delay: null });
      setup();
      await user.type(field(), 'keep me');
      clipboardReads(user, () => Promise.reject(new Error('denied')));
      await user.click(pasteButton()!);
      expect(await screen.findByRole('status')).toHaveTextContent(
        "Couldn't read the clipboard",
      );
      expect(field()).toHaveValue('keep me');
    });

    it('leaves the field and says so when the clipboard is empty', async () => {
      const user = userEvent.setup({ delay: null });
      setup();
      await user.type(field(), 'keep me');
      clipboardReads(user, () => '  ');
      await user.click(pasteButton()!);
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Nothing to paste',
      );
      expect(field()).toHaveValue('keep me');
    });

    it('refuses text over the limit, never truncating', async () => {
      const user = userEvent.setup({ delay: null });
      setup();
      await user.type(field(), 'keep me');
      clipboardReads(user, () => 'x'.repeat(MAX_PASTED_TEXT_LENGTH + 1));
      await user.click(pasteButton()!);
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Too long to read: paste just the recipe',
      );
      expect(field()).toHaveValue('keep me');
    });

    it('accepts text of exactly the limit', async () => {
      const user = userEvent.setup({ delay: null });
      setup();
      clipboardReads(user, () => 'x'.repeat(MAX_PASTED_TEXT_LENGTH));
      await user.click(pasteButton()!);
      await waitFor(() =>
        expect(field()).toHaveValue('x'.repeat(MAX_PASTED_TEXT_LENGTH)),
      );
      expect(screen.queryByText(/Too long|Nothing to paste/)).toBeNull();
    });
  });

  describe('Clear', () => {
    it('appears only with text, and empties the field with no Undo', async () => {
      const user = userEvent.setup({ delay: null });
      setup();
      expect(clearButton()).toBeNull();
      await user.type(field(), 'two eggs');
      await user.click(clearButton()!);
      expect(field()).toHaveValue('');
      expect(field()).toHaveFocus();
      expect(clearButton()).toBeNull();
      expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
    });
  });

  describe('character count', () => {
    const count = () => screen.queryByText(/ characters$/);

    it('is hidden below 45,000 and shown from there', async () => {
      const user = userEvent.setup({ delay: null });
      setup();
      clipboardReads(user, () => 'x'.repeat(44_999));
      await user.click(pasteButton()!);
      await waitFor(() => expect(field()).toHaveValue('x'.repeat(44_999)));
      expect(count()).toBeNull();
      clipboardReads(user, () => 'x'.repeat(45_000));
      await user.click(pasteButton()!);
      expect(
        await screen.findByText('45,000 of 50,000 characters'),
      ).toBeVisible();
    });

    it('turns to the warning colour at the limit', async () => {
      const user = userEvent.setup({ delay: null });
      setup();
      clipboardReads(user, () => 'x'.repeat(45_000));
      await user.click(pasteButton()!);
      const near = await screen.findByText('45,000 of 50,000 characters');
      const nearColor = getComputedStyle(near).color;
      clipboardReads(user, () => 'x'.repeat(MAX_PASTED_TEXT_LENGTH));
      await user.click(pasteButton()!);
      const atLimit = await screen.findByText('50,000 of 50,000 characters');
      expect(getComputedStyle(atLimit).color).not.toBe(nearColor);
    });
  });

  describe('reading', () => {
    it('holds a text read with the language and closes', async () => {
      const user = userEvent.setup({ delay: null });
      const { onClose, calls } = setup();
      await user.click(
        screen.getByRole('radio', { name: "Keep the text's language" }),
      );
      await user.type(field(), '  2 eggs  ');
      await user.click(screen.getByRole('button', { name: 'Read the recipe' }));
      expect(onClose).toHaveBeenCalled();
      expect(recipeReads.getState().reads).toMatchObject([
        { source: { kind: 'text', text: '2 eggs' }, language: 'source' },
      ]);
      await waitFor(() =>
        expect(calls.some((c) => c.key === 'POST /api/recipes/from-link')).toBe(
          true,
        ),
      );
    });

    it('is disabled until there is text', () => {
      setup();
      expect(
        screen.getByRole('button', { name: 'Read the recipe' }),
      ).toBeDisabled();
    });

    it('refuses a read when the holder is full, keeping the sheet open', async () => {
      const user = userEvent.setup({ delay: null });
      for (let i = 0; i < MAX_HELD_RECIPE_READS; i += 1) {
        recipeReads.submit({ kind: 'text', text: `t${i}` }, 'catalog');
      }
      const { onClose } = setup();
      await user.type(field(), 'one more');
      await user.click(screen.getByRole('button', { name: 'Read the recipe' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        '5 link reads are waiting for you',
      );
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('opened from a failed link read', () => {
    it('on a phone, leaves the field unfocused so the keyboard stays down', async () => {
      setup({ prefill: { site: 'example.com', replaces: 1 } });
      const sheet = screen.getByRole('dialog', { name: 'From text' });
      await waitFor(() => expect(sheet).toHaveFocus());
      expect(field()).not.toHaveFocus();
    });

    it('names the site, focuses the field and replaces that read', async () => {
      stubViewport(1024);
      const user = userEvent.setup({ delay: null });
      setup({ unreadable: true });
      recipeReads.submit(
        { kind: 'link', url: 'https://www.example.com/p' },
        'catalog',
      );
      await waitFor(() =>
        expect(recipeReads.getState().reads[0]?.status).toBe('failed'),
      );
      const [{ id }] = recipeReads.getState().reads;
      cleanup();
      const second = setup({
        prefill: { site: 'example.com', replaces: id },
        unreadable: false,
      });
      expect(
        screen.getByText('Paste the recipe from example.com.'),
      ).toBeVisible();
      expect(screen.queryByText(/Paste the text of a recipe/)).toBeNull();
      await waitFor(() => expect(field()).toHaveFocus());
      await user.type(field(), 'two eggs');
      await user.click(screen.getByRole('button', { name: 'Read the recipe' }));
      expect(second.onClose).toHaveBeenCalled();
      const reads = linkReadsOf(recipeReads.getState().reads);
      expect(reads).toHaveLength(1);
      expect(reads[0].source.kind).toBe('text');
    });
  });
});

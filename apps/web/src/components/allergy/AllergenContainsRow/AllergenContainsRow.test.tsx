import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import {
  AllergenContainsRow,
  containsToAllergenIds,
  selectionFromAllergenIds,
  type ContainsSelection,
} from './AllergenContainsRow';

// Spec: #360 / #350, ADR 0014.
function stubAllergens() {
  const { fetchMock, calls } = stubApi({
    'GET /api/catalog/allergens': () =>
      Response.json({
        allergens: [
          { id: 'al-milk', name: 'Milk' },
          { id: 'al-peanuts', name: 'Peanuts' },
        ],
      }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function Host({
  initial,
  onValue,
}: {
  initial?: string[];
  onValue: (ids: string[] | undefined) => void;
}) {
  const [value, setValue] = useState<ContainsSelection>(() =>
    selectionFromAllergenIds(initial),
  );
  onValue(containsToAllergenIds(value));
  return <AllergenContainsRow value={value} onChange={setValue} />;
}

describe('AllergenContainsRow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts blank (Unchecked): nothing pressed, no ids to send', async () => {
    stubAllergens();
    const onValue = vi.fn();
    renderWithProviders(<Host onValue={onValue} />);

    expect(
      await screen.findByRole('button', { name: 'Peanuts' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(onValue).toHaveBeenLastCalledWith(undefined);
  });

  it('picking chips gives their ids, in the list order', async () => {
    stubAllergens();
    const onValue = vi.fn();
    renderWithProviders(<Host onValue={onValue} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Peanuts' }));
    await user.click(screen.getByRole('button', { name: 'Milk' }));

    expect(onValue).toHaveBeenLastCalledWith(['al-milk', 'al-peanuts']);
  });

  it('"None" gives an empty list and swaps with the chips', async () => {
    stubAllergens();
    const onValue = vi.fn();
    renderWithProviders(<Host onValue={onValue} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Milk' }));
    await user.click(screen.getByRole('button', { name: 'None' }));
    expect(onValue).toHaveBeenLastCalledWith([]);
    expect(screen.getByRole('button', { name: 'Milk' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await user.click(screen.getByRole('button', { name: 'Peanuts' }));
    expect(onValue).toHaveBeenLastCalledWith(['al-peanuts']);
    expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // Clicking the chosen chip again returns to blank.
    await user.click(screen.getByRole('button', { name: 'Peanuts' }));
    expect(onValue).toHaveBeenLastCalledWith(undefined);
  });

  it('opens with the initial selection already ticked', async () => {
    stubAllergens();
    renderWithProviders(<Host initial={['al-peanuts']} onValue={vi.fn()} />);

    expect(
      await screen.findByRole('button', { name: 'Peanuts' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Milk' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('opens on "None" for an empty initial list', async () => {
    stubAllergens();
    renderWithProviders(<Host initial={[]} onValue={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'None' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

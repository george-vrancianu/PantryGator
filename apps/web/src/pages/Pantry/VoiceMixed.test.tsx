import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  openReady,
  resetVoiceEnvironment,
  voiceAction as action,
  voiceIngredient as ingredient,
} from '@/test/voice';
import { holdLongEnough, pressDown, useVoiceTimers } from '@/test/voiceHold';
import { renderInAppLayout, stubApi } from '@/test/render';
import { PantryPage } from './PantryPage';

// "put the yogurts in the pantry, got the bread, and add milk" said on the Pantry page.
const mixed = [
  action({
    id: 'y',
    ingredient: ingredient('ing-yogurt', 'Yogurt'),
    quantity: 2,
    unit: 'pcs',
    defaults: { location: 'fridge', expiresOn: '2030-05-20' },
  }),
  action({
    id: 'b',
    target: 'shopping',
    op: 'uncheck',
    ingredient: ingredient('ing-bread', 'Bread'),
    rows: { shoppingItem: { id: 'i1' } },
  }),
  action({
    id: 'm',
    target: 'shopping',
    op: 'add',
    ingredient: ingredient('ing-milk', 'Milk'),
  }),
];

describe('A Voice Note across both lists', () => {
  beforeEach(() => {
    useVoiceTimers();
    resetVoiceEnvironment();
    const { fetchMock } = stubApi({
      'GET /api/pantry/recently-stocked': () =>
        Response.json({ ingredients: [] }),
      'GET /api/pantry': () => Response.json({ batches: [], runningLow: [] }),
      'GET /api/voice/config': () => Response.json({ configured: true }),
      'GET /api/catalog/search': () => Response.json({ results: [] }),
      'POST /api/voice': () =>
        Response.json(
          { transcript: 'a mixed note', actions: mixed },
          { status: 201 },
        ),
      'POST /api/voice/apply': () =>
        Response.json(
          {
            applied: [
              {
                actionId: 'm',
                list: 'shopping',
                rowId: 'i1',
                alreadyDone: false,
              },
            ],
            skipped: [
              { id: 'y', reason: 'pantry.location_required' },
              { id: 'b', reason: 'shopping.item_not_found' },
            ],
          },
          { status: 201 },
        ),
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function openReview() {
    const view = renderInAppLayout(<PantryPage />, '/pantry');
    const button = await screen.findByRole('button', {
      name: /hold to record a voice note/i,
    });
    pressDown(button);
    await screen.findByText("Gator's listening");
    await holdLongEnough();
    fireEvent.pointerUp(button);
    return { ...view, dialog: await openReady() };
  }

  it('puts the Pantry first on the Pantry page, with the Shopping List tagged "you named it"', async () => {
    const { dialog } = await openReview();
    const review = within(dialog);
    expect(
      await review.findByText(
        '3 changes on both lists · nothing is saved until you Apply',
      ),
    ).toBeVisible();

    const regions = review.getAllByRole('region');
    expect(regions.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Pantry',
      'Shopping List',
    ]);
    const pantry = within(regions[0]);
    const shopping = within(regions[1]);
    expect(pantry.getByText('Yogurt')).toBeVisible();
    expect(pantry.queryByText('you named it')).toBeNull();
    expect(shopping.getByText('Bread')).toBeVisible();
    expect(shopping.getByText('Milk')).toBeVisible();
    expect(shopping.getByText('you named it')).toBeVisible();
    expect(shopping.queryByText('Yogurt')).toBeNull();
  });

  it('names every skipped Voice Action across both lists and refreshes both lists', async () => {
    const { dialog, queryClient } = await openReview();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Apply 3 changes' }),
    );

    expect(
      await screen.findByText(
        '1 applied, 2 skipped: yogurt needed a location, bread no longer on the list',
      ),
    ).toBeVisible();
    await waitFor(() => {
      const keys = invalidate.mock.calls.map(
        ([filters]) => filters?.queryKey?.[0],
      );
      expect(keys).toEqual(expect.arrayContaining(['shopping-list', 'pantry']));
    });
  });
});

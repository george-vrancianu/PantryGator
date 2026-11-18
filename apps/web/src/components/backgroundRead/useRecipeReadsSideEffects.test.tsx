import { afterEach, describe, expect, it, vi } from 'vitest';
import { recipeReads } from '@/lib/recipeReads';
import { recipeDraftsListKey } from '@/lib/recipeDrafts';
import { renderInAppLayout } from '@/test/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('what a finished link read does off the Dock pages', () => {
  it('refreshes Drafts (N) and buzzes once, though the camera shows no strip', async () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, vibrate });
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        Response.json({ kind: 'draft', recipeDraftId: 'rd-1', title: 'Soup' }),
      ),
    );
    const { queryClient } = renderInAppLayout(<p>the camera</p>, '/scan');
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    recipeReads.submit(
      { kind: 'link', url: 'https://example.com/soup' },
      'source',
    );

    await vi.waitFor(() =>
      expect(recipeReads.getState().reads[0].status).toBe('ready'),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: recipeDraftsListKey });
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
});

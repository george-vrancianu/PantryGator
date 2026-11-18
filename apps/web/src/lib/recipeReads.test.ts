import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextBackgroundOrder } from './backgroundItem';
import { createRecipeReads } from './recipeReads';

const requests: Array<{ url: string; force: unknown; resolve: () => void }> =
  [];

beforeEach(() => {
  requests.length = 0;
  // Every read is held until the test answers it, as a duplicate.
  vi.stubGlobal(
    'fetch',
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve) => {
        const { url, force } = JSON.parse(String(init?.body)) as {
          url: string;
          force?: boolean;
        };
        requests.push({
          url,
          force,
          resolve: () =>
            resolve(Response.json({ kind: 'duplicate', recipeId: 'r1' })),
        });
      }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('link reads', () => {
  it('lets go of a replaced read only when it has failed', () => {
    const holder = createRecipeReads();
    holder.submit({ kind: 'link', url: 'https://a.example/x' }, 'source');
    const [running] = holder.getState().reads;
    // A stale id (router state survives a reload): the read it names is not a failed one.
    holder.submit({ kind: 'text', text: 'pasted' }, 'source', {
      replaces: running.id,
    });
    expect(holder.getState().reads.map((r) => r.id)).toContain(running.id);
    expect(holder.getState().reads).toHaveLength(2);
    holder.clear();
  });

  it('stamps each read on the clock every background item shares', () => {
    const holder = createRecipeReads();
    const before = nextBackgroundOrder();
    holder.submit({ kind: 'link', url: 'https://a.example/x' }, 'source');
    holder.submit({ kind: 'link', url: 'https://b.example/x' }, 'source');
    const [first, second] = holder.getState().reads;
    expect(first.order).toBeGreaterThan(before);
    expect(second.order).toBeGreaterThan(first.order);
    expect(nextBackgroundOrder()).toBeGreaterThan(second.order);
    holder.clear();
  });

  it('reads a link again with force when the server answers a duplicate after all, behind the ones already waiting', async () => {
    const holder = createRecipeReads();
    const link = (n: number) => ({
      kind: 'link' as const,
      url: `https://site${n}.example/x`,
    });
    holder.submit(link(1), 'source');
    holder.submit(link(2), 'source');
    holder.submit(link(3), 'source');
    // 1 and 2 run, 3 waits. 1 answers as a duplicate (saved since the sheet asked): it is read again, after 3.
    requests[0].resolve();
    await vi.waitFor(() =>
      expect(holder.getState().reads[2].status).toBe('reading'),
    );
    const [one, two] = holder.getState().reads;
    holder.submit(link(4), 'source');
    expect(holder.getState().reads.find((r) => r.id === one.id)?.status).toBe(
      'waiting',
    );
    // Freeing a slot starts the read-again, not 4 (it was waiting longer).
    holder.discard(two.id);
    await vi.waitFor(() => expect(requests).toHaveLength(4));
    expect(requests[3].url).toBe('https://site1.example/x');
    expect(requests[3].force).toBe(true);
    holder.clear();
  });

  it('sends force from the start when asked to', () => {
    const holder = createRecipeReads();
    holder.submit({ kind: 'link', url: 'https://a.example/x' }, 'source', {
      force: true,
    });
    expect(requests[0].force).toBe(true);
    holder.clear();
  });
});

describe('recipe reads', () => {
  it('carries the link kind on every read that is submitted', () => {
    const holder = createRecipeReads();
    holder.submit({ kind: 'link', url: 'https://a.example/x' }, 'source');
    holder.submit({ kind: 'text', text: 'pasted' }, 'source');
    expect(holder.getState().reads.map((r) => r.kind)).toEqual([
      'link',
      'link',
    ]);
    holder.clear();
  });
});

describe('plate reads', () => {
  const answers: Array<Response> = [];
  const sent: Array<{ url: string; body: unknown }> = [];

  beforeEach(() => {
    answers.length = 0;
    sent.length = 0;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
      });
      return Promise.resolve(answers.shift() ?? new Response(null));
    });
  });

  const plate = (title: string) => ({
    kind: 'plate' as const,
    title,
    token: `token-${title}`,
  });

  it('writes the picked dish with its token and keeps the Recipe Draft it answers with', async () => {
    answers.push(Response.json({ recipeDraftId: 'draft-1' }));
    const holder = createRecipeReads();
    expect(holder.add(plate('Pancakes'))).toBe('started');
    await vi.waitFor(() =>
      expect(holder.getState().reads[0]).toMatchObject({
        status: 'ready',
        recipeDraftId: 'draft-1',
      }),
    );
    expect(sent).toEqual([
      {
        url: '/api/scan/plate/recipe',
        body: { dishTitle: 'Pancakes', plateToken: 'token-Pancakes' },
      },
    ]);
    holder.clear();
  });

  it('shares the limits with link reads: two read at once, five are held', () => {
    vi.stubGlobal('fetch', () => new Promise<Response>(() => {}));
    const holder = createRecipeReads();
    holder.submit({ kind: 'link', url: 'https://a.example/x' }, 'source');
    holder.add(plate('A'));
    holder.add(plate('B'));
    expect(holder.getState().reads.map((r) => r.status)).toEqual([
      'reading',
      'reading',
      'waiting',
    ]);
    holder.add(plate('C'));
    holder.add(plate('D'));
    expect(holder.add(plate('E'))).toBe('full');
    holder.clear();
  });

  it('hands a plate read back, not capped, when the server refuses it with a code it is returned on', async () => {
    answers.push(
      Response.json(
        { code: 'credits.insufficient', params: { price: 1, balance: 0 } },
        { status: 402 },
      ),
    );
    const holder = createRecipeReads();
    const returned: unknown[] = [];
    const settled = vi.fn();
    holder.onReadSettled(settled);
    holder.add({
      ...plate('Pancakes'),
      returnOn: ['credits.insufficient'],
      onReturned: (error) => returned.push(error),
    });
    await vi.waitFor(() => expect(returned).toHaveLength(1));
    expect(returned[0]).toMatchObject({
      code: 'credits.insufficient',
      params: { price: 1, balance: 0 },
    });
    expect(holder.getState().reads).toEqual([]);
    expect(settled).toHaveBeenCalled();
    holder.clear();
  });

  it('still caps the reads waiting behind a plate read handed back for Credits', async () => {
    vi.stubGlobal('fetch', (input: RequestInfo | URL) =>
      String(input).includes('/plate/recipe')
        ? Promise.resolve(
            Response.json(
              { code: 'credits.insufficient', params: {} },
              { status: 402 },
            ),
          )
        : new Promise<Response>(() => {}),
    );
    const holder = createRecipeReads();
    const onReturned = vi.fn();
    holder.add({
      ...plate('A'),
      returnOn: ['credits.insufficient'],
      onReturned,
    });
    holder.submit({ kind: 'link', url: 'https://a.example/x' }, 'source');
    holder.submit({ kind: 'link', url: 'https://b.example/x' }, 'source');
    await vi.waitFor(() => expect(onReturned).toHaveBeenCalled());
    expect(holder.getState().reads.map((r) => r.status)).toEqual([
      'reading',
      'capped',
    ]);
    holder.clear();
  });

  it('hands back a waiting plate read when a link read is refused for Credits', async () => {
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const body = String(init?.body ?? '');
      return String(input).includes('from-link') && body.includes('a.example')
        ? Promise.resolve(
            Response.json(
              { code: 'credits.insufficient', params: { price: 1 } },
              { status: 402 },
            ),
          )
        : new Promise<Response>(() => {});
    });
    const holder = createRecipeReads();
    const onReturned = vi.fn();
    holder.submit({ kind: 'link', url: 'https://a.example/x' }, 'source');
    holder.submit({ kind: 'link', url: 'https://b.example/x' }, 'source');
    holder.add({
      ...plate('Waiting'),
      returnOn: ['credits.insufficient'],
      onReturned,
    });
    await vi.waitFor(() => expect(onReturned).toHaveBeenCalled());
    expect(onReturned.mock.calls[0][0]).toMatchObject({
      code: 'credits.insufficient',
    });
    expect(holder.getState().reads.map((r) => r.kind)).not.toContain('plate');
    expect(holder.getState().reads.map((r) => r.status)).not.toContain(
      'waiting',
    );
    holder.clear();
  });

  it('hands back a waiting plate read when another plate read is handed back for Credits', async () => {
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('/plate/recipe') &&
      String(init?.body).includes('token-A')
        ? Promise.resolve(
            Response.json(
              { code: 'credits.insufficient', params: {} },
              { status: 402 },
            ),
          )
        : new Promise<Response>(() => {}),
    );
    const holder = createRecipeReads();
    const returnedA = vi.fn();
    const returnedB = vi.fn();
    const returnOn = ['credits.insufficient'];
    holder.add({ ...plate('A'), returnOn, onReturned: returnedA });
    holder.submit({ kind: 'link', url: 'https://a.example/x' }, 'source');
    holder.add({ ...plate('B'), returnOn, onReturned: returnedB });
    await vi.waitFor(() => expect(returnedA).toHaveBeenCalled());
    expect(returnedB).toHaveBeenCalledTimes(1);
    expect(holder.getState().reads.map((r) => r.kind)).toEqual(['link']);
    holder.clear();
  });

  it('caps a plate read refused for a code it is not returned on', async () => {
    answers.push(
      Response.json(
        { code: 'credits.insufficient', params: {} },
        { status: 402 },
      ),
    );
    const holder = createRecipeReads();
    holder.add(plate('Pancakes'));
    await vi.waitFor(() =>
      expect(holder.getState().reads[0]?.status).toBe('capped'),
    );
    holder.clear();
  });

  it('a Link Cap refusal holds the waiting link reads but not the waiting plate reads', async () => {
    vi.stubGlobal('fetch', (input: RequestInfo | URL) =>
      String(input).includes('from-link')
        ? Promise.resolve(
            Response.json(
              { code: 'link.cap_reached', params: {} },
              { status: 429 },
            ),
          )
        : new Promise<Response>(() => {}),
    );
    const holder = createRecipeReads();
    holder.add(plate('Slow'));
    holder.submit({ kind: 'link', url: 'https://a.example/x' }, 'source');
    holder.add(plate('Waiting'));
    holder.submit({ kind: 'link', url: 'https://b.example/x' }, 'source');
    await vi.waitFor(() =>
      expect(holder.getState().reads.map((r) => r.status)).toEqual([
        'reading',
        'capped',
        // Its slot freed, the plate read waiting behind the refusal started.
        'reading',
        'capped',
      ]),
    );
    holder.clear();
  });
});

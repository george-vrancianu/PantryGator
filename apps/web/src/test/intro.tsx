import { fireEvent, screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import { stubApi } from './render';

/** The router's current path and query, to assert where a click went: `screen.getByLabelText('Where')`. */
export function Where() {
  const { pathname, search } = useLocation();
  return <output aria-label="Where">{pathname + search}</output>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

type Routes = Parameters<typeof stubApi>[0];

/**
 * A signed-in Member who is not done with the Intro, on a server that can transcribe. Marking the Intro
 * done (`PUT /settings/preferences {introDone:true}`) sticks, or fails when `finishFails` is set. Extra
 * routes are merged over these. Returns the calls, to assert request bodies.
 */
export function stubSetupMember({
  routes = {},
  finishFails = false,
}: { routes?: Routes; finishFails?: boolean } = {}) {
  let done = false;
  const { fetchMock, calls } = stubApi({
    'GET /api/auth/get-session': () =>
      Response.json({
        user: { id: '1', name: 'Ana', email: 'ana@example.com' },
      }),
    'GET /api/settings/preferences': () =>
      Response.json({ introDone: done, theme: null, locale: 'en' }),
    'PUT /api/settings/preferences': () => {
      if (finishFails)
        return Response.json({ code: 'unknown', params: {} }, { status: 500 });
      const body = calls.at(-1)?.body;
      done = done || (isObject(body) && body.introDone === true);
      return Response.json({ introDone: done, theme: null, locale: 'en' });
    },
    'GET /api/voice/config': () => Response.json({ configured: true }),
    ...routes,
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

/** The bodies of every `PUT /settings/preferences` so far. */
export const preferenceSaves = (calls: ReturnType<typeof stubSetupMember>) =>
  calls
    .filter((call) => call.key === 'PUT /api/settings/preferences')
    .map((call) => call.body);

/**
 * From Set up or skip to Say it the way a Member gets there: "Show me how", then Snap's Skip. (Opening Say
 * it fresh sends the Member back to Set up or skip, since Setup was not started in that visit.)
 */
export async function goToSayIt() {
  fireEvent.click(await screen.findByRole('button', { name: /Show me how/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));
}

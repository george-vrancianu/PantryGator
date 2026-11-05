import { Capacitor } from '@capacitor/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from './api';
import { nativeSession } from './nativeSession';

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(() =>
    response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends credentials and a JSON body to the /api prefix', async () => {
    const fetchMock = stubFetch(Response.json({ ok: true }));

    await apiRequest('/auth/sign-in/email', {
      method: 'POST',
      body: { email: 'a@b.co' },
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/api\/auth\/sign-in\/email$/);
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.co' }));
  });

  it('returns the parsed body, including a literal null', async () => {
    stubFetch(new Response('null', { status: 200 }));
    await expect(apiRequest('/auth/get-session')).resolves.toBeNull();
  });

  it('turns an API error body into an ApiError with code and params', async () => {
    stubFetch(
      Response.json(
        { code: 'auth.invalid_email_or_password', params: { a: 1 } },
        { status: 401 },
      ),
    );

    const error = await apiRequest('/x').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'auth.invalid_email_or_password',
      params: { a: 1 },
      status: 401,
    });
  });

  it('falls back to a status code when the error body is not the API shape', async () => {
    stubFetch(new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(apiRequest('/x')).rejects.toMatchObject({
      code: 'unknown',
      status: 502,
    });
  });

  it('reports a network failure with its own code', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    await expect(apiRequest('/x')).rejects.toMatchObject({
      code: 'network_error',
      status: 0,
    });
  });
});

describe('apiRequest in the mobile apps', () => {
  beforeEach(() => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
  });

  afterEach(async () => {
    await nativeSession.forget();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const lastInit = (fetchMock: ReturnType<typeof stubFetch>) =>
    fetchMock.mock.calls.at(-1)![1 as never] as RequestInit;

  it('keeps the token a sign-in hands over and sends it as a Bearer token, without cookies', async () => {
    stubFetch(
      Response.json({}, { headers: { 'set-auth-token': 'abc.signature' } }),
    );
    await apiRequest('/auth/sign-in/email', { method: 'POST', body: {} });

    const fetchMock = stubFetch(Response.json({}));
    await apiRequest('/family');

    const init = lastInit(fetchMock);
    expect(init.credentials).toBe('omit');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer abc.signature',
    });
  });

  it('sends no Authorization header before signing in, or after signing out', async () => {
    let fetchMock = stubFetch(Response.json({}));
    await apiRequest('/auth/get-session');
    expect(lastInit(fetchMock).headers).not.toHaveProperty('authorization');

    stubFetch(Response.json({}, { headers: { 'set-auth-token': 'abc.sig' } }));
    await apiRequest('/auth/sign-in/email', { method: 'POST', body: {} });
    await nativeSession.forget();

    fetchMock = stubFetch(Response.json({}));
    await apiRequest('/auth/get-session');
    expect(lastInit(fetchMock).headers).not.toHaveProperty('authorization');
  });

  it('keeps the token across an app restart', async () => {
    stubFetch(Response.json({}, { headers: { 'set-auth-token': 'kept.sig' } }));
    await apiRequest('/auth/sign-in/email', { method: 'POST', body: {} });

    vi.resetModules();
    const fresh = await import('./api');
    const fetchMock = stubFetch(Response.json({}));
    await fresh.apiRequest('/family');

    expect(lastInit(fetchMock).headers).toMatchObject({
      authorization: 'Bearer kept.sig',
    });
  });
});

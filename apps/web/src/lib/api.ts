import { nativeSession } from './nativeSession';

// Same origin by default: Vite proxies `/api` in dev, the API serves the app in production.
export const apiOrigin = (import.meta.env.VITE_API_URL ?? '').replace(
  /\/$/,
  '',
);

/** An error response from the API: `{ code, params }`, never user-facing text. */
export class ApiError extends Error {
  readonly code: string;
  readonly params: Record<string, unknown>;
  readonly status: number;

  constructor(
    code: string,
    status: number,
    params: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.params = params;
  }
}

/** No response at all (the request never got an answer), not an answer that says no. */
export const isNetworkError = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'network_error';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Aborting it abandons the request on this side only; the server is not told. */
  signal?: AbortSignal;
  /** Lets the request finish after the page is gone (unload). The browser caps such bodies at 64 KB. */
  keepalive?: boolean;
};

function isErrorBody(
  value: unknown,
): value is { code: string; params?: Record<string, unknown> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { code?: unknown }).code === 'string'
  );
}

export async function apiRequest<T>(
  path: string,
  { method = 'GET', body, signal, keepalive }: RequestOptions = {},
): Promise<T> {
  // The mobile apps send the session as a Bearer token instead of the cookie.
  // A browser skips the await, so the request still starts in the same tick.
  const native = nativeSession.isActive();
  const authorization = native
    ? await nativeSession.authorization()
    : undefined;
  const headers: Record<string, string> = {
    // A FormData body sets its own multipart content type (with the boundary).
    ...(body === undefined || body instanceof FormData
      ? {}
      : { 'content-type': 'application/json' }),
    ...(authorization ? { authorization } : {}),
  };
  let response: Response;
  try {
    response = await fetch(`${apiOrigin}/api${path}`, {
      method,
      credentials: native ? 'omit' : 'include',
      ...(signal ? { signal } : {}),
      ...(keepalive ? { keepalive } : {}),
      headers,
      body:
        body === undefined || body instanceof FormData
          ? (body as FormData | undefined)
          : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('network_error', 0);
  }

  if (native) await nativeSession.remember(response);

  if (!response.ok) {
    const parsed: unknown = await response.json().catch(() => null);
    if (isErrorBody(parsed)) {
      throw new ApiError(parsed.code, response.status, parsed.params ?? {});
    }
    throw new ApiError('unknown', response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

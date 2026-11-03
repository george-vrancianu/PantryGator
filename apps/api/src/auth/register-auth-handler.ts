import type { FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { codeForStatus } from '../common/api-error';
import type { AuthInstance } from './auth.types';

/** Internal header carrying the client IP (`request.clientIp`) to Better Auth; overwritten on every request. */
export const CLIENT_IP_HEADER = 'x-pocket-pantry-client-ip';

/**
 * better-auth errors are `{ code, message }` with a library-authored English
 * message. Keep the stable code and drop the message so this surface follows
 * the same `{ code, params }` convention as the rest of the API.
 */
export function toApiErrorBody(text: string, status: number): string {
  let code = `auth.${codeForStatus(status)}`;
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'code' in parsed &&
      typeof parsed.code === 'string'
    ) {
      // Our own stable codes (`promo_code.required`) are already namespaced.
      const lower = parsed.code.toLowerCase();
      code = lower.includes('.') ? lower : `auth.${lower}`;
    }
  } catch {
    // Empty or non-JSON error body: keep the status-derived code.
  }
  return JSON.stringify({ code, params: {} });
}

export function registerAuthHandler(
  fastify: FastifyInstance,
  auth: AuthInstance,
): void {
  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const origin = `${request.protocol}://${request.headers.host ?? 'localhost'}`;
      const url = new URL(request.url, origin);
      const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
      const headers = fromNodeHeaders(request.raw.headers);
      // Set by us: signup's limiters and Better Auth's rate limit trust this, never a client-sent header.
      headers.set(CLIENT_IP_HEADER, request.clientIp);
      if (hasBody && request.body !== undefined) {
        headers.set('content-type', 'application/json');
      }
      const authRequest = new Request(url, {
        method: request.method,
        headers,
        body:
          hasBody && request.body !== undefined
            ? JSON.stringify(request.body)
            : undefined,
      });
      const response = await auth.handler(authRequest);

      reply.code(response.status);
      const isError = response.status >= 400;
      response.headers.forEach((value, key) => {
        if (key === 'set-cookie') return;
        if (isError && (key === 'content-length' || key === 'content-type'))
          return;
        reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header('set-cookie', cookies);

      if (isError) {
        return reply
          .header('content-type', 'application/json; charset=utf-8')
          .send(toApiErrorBody(await response.text(), response.status));
      }
      if (!response.body || response.status === 204) return reply.send();
      return reply.send(await response.text());
    },
  });
}

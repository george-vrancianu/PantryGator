import { isIP } from 'node:net';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * The client's IP address, for per-IP rate limits. The socket address, or the
     * `TRUSTED_CLIENT_IP_HEADER` value when that is set and holds one IP address.
     */
    clientIp: string;
  }
}

/**
 * Sets `request.clientIp` on every request. Use it instead of `request.ip`.
 *
 * Behind a hosting proxy the socket address is the proxy's, so every client
 * would share one per-IP budget. Name a header only when the platform in front
 * of the API overwrites it on every request (Render: `cf-connecting-ip`, written
 * by Cloudflare). A header the platform merely appends to, such as
 * `x-forwarded-for` on Render, lets a client pick its own IP.
 */
export function registerClientIp(
  fastify: FastifyInstance,
  trustedHeader: string | undefined,
): void {
  const header = trustedHeader?.toLowerCase();
  fastify.decorateRequest('clientIp', '');
  fastify.addHook('onRequest', (request, _reply, done) => {
    const value = header ? request.headers[header] : undefined;
    const candidate = typeof value === 'string' ? value.trim() : undefined;
    request.clientIp = candidate && isIP(candidate) ? candidate : request.ip;
    done();
  });
}

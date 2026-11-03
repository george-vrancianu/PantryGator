import Fastify from 'fastify';
import { registerClientIp } from './client-ip';

async function clientIpFor(
  trustedHeader: string | undefined,
  headers: Record<string, string> = {},
): Promise<string> {
  const fastify = Fastify();
  registerClientIp(fastify, trustedHeader);
  fastify.get('/ip', (request) => ({ ip: request.clientIp }));
  const response = await fastify.inject({
    method: 'GET',
    url: '/ip',
    headers,
    remoteAddress: '10.0.0.7',
  });
  await fastify.close();
  return response.json<{ ip: string }>().ip;
}

describe('registerClientIp', () => {
  it('uses the socket address when no header is trusted, ignoring forwarding headers', async () => {
    expect(
      await clientIpFor(undefined, {
        'x-forwarded-for': '203.0.113.9',
        'cf-connecting-ip': '203.0.113.9',
      }),
    ).toBe('10.0.0.7');
  });

  it('uses the trusted header when it holds one IP address', async () => {
    expect(
      await clientIpFor('cf-connecting-ip', {
        'cf-connecting-ip': '203.0.113.9',
      }),
    ).toBe('203.0.113.9');
    expect(
      await clientIpFor('cf-connecting-ip', {
        'cf-connecting-ip': ' 2001:db8::1 ',
      }),
    ).toBe('2001:db8::1');
  });

  it('matches the header name regardless of case', async () => {
    expect(
      await clientIpFor('CF-Connecting-IP', {
        'cf-connecting-ip': '203.0.113.9',
      }),
    ).toBe('203.0.113.9');
  });

  it('falls back to the socket address when the trusted header is missing or not one IP', async () => {
    expect(await clientIpFor('cf-connecting-ip')).toBe('10.0.0.7');
    expect(
      await clientIpFor('cf-connecting-ip', {
        'cf-connecting-ip': '203.0.113.9, 198.51.100.4',
      }),
    ).toBe('10.0.0.7');
    expect(
      await clientIpFor('cf-connecting-ip', {
        'cf-connecting-ip': 'not-an-ip',
      }),
    ).toBe('10.0.0.7');
  });
});

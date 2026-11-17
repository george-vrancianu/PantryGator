import { Inject } from '@nestjs/common';
import { Resolver } from 'node:dns/promises';
import * as http from 'node:http';
import * as https from 'node:https';
import { isIP } from 'node:net';
import { isPublicAddress } from './public-address';

/** A fetched page: where the redirects ended and its HTML text. */
export type FetchedPage = { finalUrl: string; html: string };

/**
 * The one door to a web page for Recipe from Link. Throws `PageFetchError`.
 * Tests replace the `PAGE_FETCHER` provider, so none reaches the network.
 */
export type PageFetcher = {
  /** Aborting `signal` abandons the fetch (the connection is closed); the call then throws `unreadable`. */
  fetchPage(url: string, signal?: AbortSignal): Promise<FetchedPage>;
};

export const PAGE_FETCHER = Symbol('PAGE_FETCHER');

/** Injects the fetcher: `constructor(@InjectPageFetcher() pages: PageFetcher)`. */
export const InjectPageFetcher = () => Inject(PAGE_FETCHER);

/**
 * `invalid`: the link itself is refused (not a URL, not http(s), has
 * credentials, a non-default port, or a host that is or resolves to a
 * non-public address), at the first URL or at any redirect hop. Maps to
 * `link.invalid`.
 *
 * `unreadable`: the link is acceptable but the page could not be read (DNS
 * failure, connect error, timeout, too large, not HTML, non-2xx, too many
 * redirects, a redirect without Location). Maps to `link.unreadable`.
 */
export type PageFetchErrorKind = 'invalid' | 'unreadable';

export class PageFetchError extends Error {
  constructor(
    readonly kind: PageFetchErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'PageFetchError';
  }
}

export type ResolvedAddress = { address: string; family: number };

export type PageFetcherOptions = {
  /** Every address of a hostname (like `dns.lookup(host, { all: true })`). */
  lookup: (hostname: string) => Promise<ResolvedAddress[]>;
  /** Whether a resolved or literal address may be connected to. */
  isAddressAllowed: (address: string) => boolean;
  /** Whether a URL's explicit port (`''` when it is the scheme's default) is allowed. */
  isPortAllowed: (port: string) => boolean;
  /** One deadline for the whole fetch: DNS, connect, TLS, headers and body of every hop. */
  timeoutMs: number;
  /** Largest body, counted as it arrives. */
  maxBytes: number;
  maxRedirects: number;
};

/** The slice of `dns.promises.Resolver` the lookup uses; tests pass a fake. */
export type AddressResolver = Pick<Resolver, 'resolve4' | 'resolve6'>;

/**
 * Every A and AAAA address of a host. Unlike `dns.lookup`, which runs on the libuv
 * threadpool (a few slow lookups starve file and crypto work), a `Resolver` talks to
 * the nameserver through c-ares on the event loop. A family with no records
 * (`ENODATA`) is fine; NXDOMAIN, a timeout or any other failure rejects, which the
 * fetcher reports as `unreadable`. It does not read `/etc/hosts`.
 */
export async function resolveAddresses(
  resolver: AddressResolver,
  hostname: string,
): Promise<ResolvedAddress[]> {
  const settled = await Promise.allSettled([
    resolver.resolve4(hostname),
    resolver.resolve6(hostname),
  ]);
  const found: ResolvedAddress[] = [];
  const families = [4, 6];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      for (const address of result.value) {
        found.push({ address, family: families[index] });
      }
    } else if ((result.reason as { code?: string })?.code !== 'ENODATA') {
      throw result.reason;
    }
  });
  return found;
}

let sharedResolver: Resolver | undefined;

/** The production lookup: c-ares through one shared `Resolver` with a short timeout and two tries. */
export function resolverLookup(hostname: string): Promise<ResolvedAddress[]> {
  sharedResolver ??= new Resolver({ timeout: 2500, tries: 2 });
  return resolveAddresses(sharedResolver, hostname);
}

/**
 * Production policy. Ports: only the scheme's default (80, 443) are allowed,
 * because recipe sites never need another and non-default ports are how
 * internal services (databases, admin panels) sit next to public hosts. The
 * WHATWG URL parser drops a port equal to the default, so an explicit port
 * here is always a non-default one. No env var or flag relaxes this; tests
 * pass their own options.
 */
export const STRICT_PAGE_FETCHER_OPTIONS: Readonly<PageFetcherOptions> =
  Object.freeze({
    lookup: resolverLookup,
    isAddressAllowed: isPublicAddress,
    isPortAllowed: (port) => port === '',
    timeoutMs: 10_000,
    maxBytes: 3 * 1024 * 1024,
    maxRedirects: 5,
  });

export const PAGE_FETCHER_USER_AGENT =
  'PocketPantry-RecipeFromLink/1.0 (+https://github.com/george-vrancianu/PantryGator)';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HTML_TYPES = new Set(['text/html', 'application/xhtml+xml']);

type Hop =
  { kind: 'redirect'; location: string } | { kind: 'page'; html: string };

const unreadable = (message: string) =>
  new PageFetchError('unreadable', message);
const invalid = (message: string) => new PageFetchError('invalid', message);

/**
 * Builds a fetcher with the SSRF address guard.
 *
 * - Schemes: http and https only, on the first URL and on every redirect hop
 *   (so `file:`, `ftp:`, `data:`, `javascript:` are refused). A redirect from
 *   https to http is allowed: every hop is checked again anyway, and nothing
 *   secret is sent.
 * - URL credentials (`user:pass@`) are refused. Odd IPv4 literals
 *   (`2130706433`, `0x7f.1`, `0177.0.0.1`, `127.1`) are normalised to dotted
 *   quad by `new URL()` and so checked like any address.
 * - The host is resolved once per hop (all addresses). If ANY address is not
 *   allowed the hop is refused; otherwise the request connects to the first
 *   address by IP (`host: ip`) with the original hostname kept as the Host
 *   header and TLS `servername`, so there is no second DNS lookup between
 *   check and connect and certificates are still checked against the hostname.
 * - Redirects are followed manually (301/302/303/307/308), relative Location
 *   resolved against the current URL, at most `maxRedirects`.
 * - No proxy: requests use `node:http(s)` with `agent: false` (a fresh private
 *   agent), so neither HTTP(S)_PROXY nor `NODE_USE_ENV_PROXY`, which only
 *   configure the global agents, can route around the guard.
 * - Size: the body is counted as it streams and the request is destroyed over
 *   the cap; an over-cap Content-Length is refused early. We send
 *   `Accept-Encoding: identity` and refuse any other Content-Encoding, so
 *   there is nothing to decompress (no gzip bombs).
 * - Timeout: one AbortController deadline covers lookup, connect, TLS,
 *   headers and body across all hops (a slow-drip body times out).
 * - Content type: `text/html` or `application/xhtml+xml` (case-insensitive,
 *   parameters allowed). A missing Content-Type is refused. The body is decoded
 *   with the Content-Type `charset` when `TextDecoder` knows it, else UTF-8
 *   (no `<meta>` sniffing).
 */
export function createPageFetcher(
  options: Readonly<PageFetcherOptions> = STRICT_PAGE_FETCHER_OPTIONS,
): PageFetcher {
  async function checkedAddress(url: URL): Promise<ResolvedAddress> {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw invalid('Only http and https links are allowed');
    }
    if (url.username || url.password) {
      throw invalid('Links with credentials are refused');
    }
    if (!options.isPortAllowed(url.port)) {
      throw invalid('That port is not allowed');
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const family = isIP(host);
    let addresses: ResolvedAddress[];
    if (family) {
      addresses = [{ address: host, family }];
    } else {
      try {
        addresses = await options.lookup(host);
      } catch {
        throw unreadable('The host could not be resolved');
      }
    }
    if (addresses.length === 0) throw unreadable('The host has no address');
    if (!addresses.every(({ address }) => options.isAddressAllowed(address))) {
      throw invalid('That address is not allowed');
    }
    return addresses[0];
  }

  function readHop(
    url: URL,
    target: ResolvedAddress,
    signal: AbortSignal,
  ): Promise<Hop> {
    return new Promise<Hop>((resolve, reject) => {
      let settled = false;
      const settle = (done: () => void) => {
        if (settled) return;
        settled = true;
        done();
      };
      const secure = url.protocol === 'https:';
      const hostname = url.hostname.replace(/^\[|\]$/g, '');
      const req = (secure ? https : http).request(
        {
          host: target.address,
          family: target.family,
          port: url.port || (secure ? 443 : 80),
          method: 'GET',
          path: `${url.pathname}${url.search}`,
          agent: false,
          signal,
          // TLS checks the certificate against the hostname, not the IP.
          ...(secure && !isIP(hostname) ? { servername: hostname } : {}),
          headers: {
            Host: url.host,
            'User-Agent': PAGE_FETCHER_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Encoding': 'identity',
          },
        },
        (res) => {
          const fail = (message: string) => {
            res.destroy();
            req.destroy();
            settle(() => reject(unreadable(message)));
          };
          const status = res.statusCode ?? 0;
          if (REDIRECT_STATUSES.has(status)) {
            const location = res.headers.location;
            res.destroy();
            if (!location) {
              settle(() =>
                reject(unreadable('A redirect came without a Location')),
              );
            } else {
              settle(() => resolve({ kind: 'redirect', location }));
            }
            return;
          }
          if (status < 200 || status > 299) {
            return fail(`The page answered ${status}`);
          }
          const contentType = res.headers['content-type'];
          const [mime, ...params] = (contentType ?? '').split(';');
          if (!HTML_TYPES.has(mime.trim().toLowerCase())) {
            return fail('The page is not HTML');
          }
          const encoding = res.headers['content-encoding'];
          if (encoding && encoding.trim().toLowerCase() !== 'identity') {
            return fail('The page is compressed in an unsupported way');
          }
          const declared = Number(res.headers['content-length']);
          if (Number.isFinite(declared) && declared > options.maxBytes) {
            return fail('The page is too large');
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > options.maxBytes) return fail('The page is too large');
            chunks.push(chunk);
          });
          res.on('end', () =>
            settle(() =>
              resolve({
                kind: 'page',
                html: decode(Buffer.concat(chunks), params),
              }),
            ),
          );
          res.on('error', () => fail('The page could not be read'));
          res.on('close', () => {
            if (!res.complete) fail('The connection closed early');
          });
        },
      );
      req.on('error', () =>
        settle(() =>
          reject(
            unreadable(
              signal.aborted
                ? 'The page took too long'
                : 'The page could not be reached',
            ),
          ),
        ),
      );
      req.end();
    });
  }

  return {
    async fetchPage(input, signal) {
      let url: URL;
      try {
        url = new URL(input);
      } catch {
        throw invalid('Not a valid link');
      }
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(), options.timeoutMs);
      const expired = new Promise<never>((_, reject) => {
        deadline.signal.addEventListener(
          'abort',
          () => reject(unreadable('The page took too long')),
          { once: true },
        );
      });
      expired.catch(() => undefined);
      // The caller gave up (its request closed): stop through the same deadline, which closes the connection.
      const giveUp = () => deadline.abort();
      if (signal?.aborted) giveUp();
      else signal?.addEventListener('abort', giveUp, { once: true });
      try {
        for (let redirects = 0; ; redirects += 1) {
          const target = await Promise.race([checkedAddress(url), expired]);
          const hop = await readHop(url, target, deadline.signal);
          if (hop.kind === 'page') {
            return { finalUrl: url.href, html: hop.html };
          }
          if (redirects >= options.maxRedirects) {
            throw unreadable('Too many redirects');
          }
          try {
            url = new URL(hop.location, url);
          } catch {
            throw invalid('A redirect led to an invalid link');
          }
        }
      } catch (error) {
        // Anything unexpected (e.g. a synchronous throw from `http.request`) is a failed read, not a refused link.
        if (error instanceof PageFetchError) throw error;
        throw unreadable('The page could not be read');
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', giveUp);
        deadline.abort();
      }
    },
  };
}

function decode(body: Buffer, params: string[]): string {
  const charset = params
    .map((param) => /^\s*charset\s*=\s*"?([^";\s]+)"?\s*$/i.exec(param)?.[1])
    .find(Boolean);
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}

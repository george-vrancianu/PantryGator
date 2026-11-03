const PORTS = [5173, 5174];
const LOCAL_HOSTS = ['localhost', '127.0.0.1'];
// Private LAN ranges, as better-auth style wildcard patterns.
const LAN_HOSTS = [
  '10.*.*.*',
  '192.168.*.*',
  ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
];

/**
 * The mobile apps (Capacitor) load the web app from local files on these origins:
 * iOS `capacitor://localhost`, Android `https://localhost` (ADR 0036).
 */
export const MOBILE_APP_ORIGINS = [
  'capacitor://localhost',
  'https://localhost',
];

/** Single source of truth for browser origins allowed by CORS and better-auth. */
export function allowedOrigins(clientOrigin: string): string[] {
  return [
    clientOrigin,
    ...MOBILE_APP_ORIGINS,
    ...[...LOCAL_HOSTS, ...LAN_HOSTS].flatMap((host) =>
      PORTS.map((port) => `http://${host}:${port}`),
    ),
  ];
}

function patternToRegExp(pattern: string): RegExp {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[0-9]{1,3}');
  return new RegExp(`^${source}$`);
}

export function isAllowedOrigin(origin: string, patterns: string[]): boolean {
  return patterns.some((pattern) => patternToRegExp(pattern).test(origin));
}

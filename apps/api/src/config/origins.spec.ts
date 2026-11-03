import { allowedOrigins, isAllowedOrigin } from './origins';

const client = 'https://app.example.com';
const patterns = allowedOrigins(client);
const allowed = (origin: string) => isAllowedOrigin(origin, patterns);

describe('isAllowedOrigin', () => {
  it('allows the configured client origin', () => {
    expect(allowed(client)).toBe(true);
  });

  it('allows the mobile apps', () => {
    expect(allowed('capacitor://localhost')).toBe(true);
    expect(allowed('https://localhost')).toBe(true);
    expect(allowed('capacitor://localhost.evil.com')).toBe(false);
    expect(allowed('https://localhost.evil.com')).toBe(false);
    expect(allowed('capacitor://evil')).toBe(false);
  });

  it('allows localhost and loopback dev origins', () => {
    expect(allowed('http://localhost:5173')).toBe(true);
    expect(allowed('http://127.0.0.1:5174')).toBe(true);
  });

  it('allows private LAN addresses on dev ports', () => {
    expect(allowed('http://192.168.1.128:5173')).toBe(true);
    expect(allowed('http://10.0.12.7:5174')).toBe(true);
    expect(allowed('http://172.20.3.4:5173')).toBe(true);
  });

  it('rejects wildcard-lookalike hostnames and evil suffixes', () => {
    expect(allowed('http://10.a.evil.com:5173')).toBe(false);
    expect(allowed('http://192.168.1.1.evil.com:5173')).toBe(false);
    expect(allowed('http://localhost.evil.com:5173')).toBe(false);
    expect(allowed('http://evil.com/http://localhost:5173')).toBe(false);
  });

  it('rejects a scheme mismatch', () => {
    expect(allowed('https://localhost:5173')).toBe(false);
    expect(allowed('http://app.example.com')).toBe(false);
  });

  it('rejects an extra or unlisted port', () => {
    expect(allowed('http://localhost:3000')).toBe(false);
    expect(allowed('http://192.168.1.5:80')).toBe(false);
    expect(allowed('http://localhost:51730')).toBe(false);
  });

  it('rejects public 172 addresses outside the private range', () => {
    expect(allowed('http://172.32.0.1:5173')).toBe(false);
  });
});

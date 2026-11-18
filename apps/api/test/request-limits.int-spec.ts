import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  DEFAULT_REQUEST_BODY_BYTES,
  SCAN_REQUEST_BODY_BYTES,
} from '../src/app.setup';
import { client, signUp } from './support/admin-session';
import { createTestApp } from './support/create-test-app';

describe('Request body limits (integration)', () => {
  let app: NestFastifyApplication;
  let cookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    cookie = await signUp(app, `limits-${Date.now()}@example.com`, 'Limits');
  });
  afterAll(async () => {
    await app.close();
  });

  it('keeps 12 MB for Scan images and a small default elsewhere', () => {
    expect(SCAN_REQUEST_BODY_BYTES).toBe(12 * 1024 * 1024);
    expect(DEFAULT_REQUEST_BODY_BYTES).toBeLessThan(SCAN_REQUEST_BODY_BYTES);
  });

  it('refuses a JSON body over the default limit on a non-Scan route with 413', async () => {
    const big = { title: 'x'.repeat(DEFAULT_REQUEST_BODY_BYTES + 1024) };
    const res = await client(app, cookie, '/api/recipe-drafts').post('', big);
    expect(res.status).toBe(413);
  });

  it('still takes a normal request on a non-Scan route', async () => {
    const res = await client(app, cookie, '/api/recipe-drafts').get('');
    expect(res.status).toBe(200);
  });

  const scanImageRoutes = [
    ['/product', 'productImage'],
    ['/ingredients', 'ingredientsImage'],
    ['/plate', 'plateImage'],
    ['/receipt', 'receiptImage'],
  ] as const;
  // Just under imageDataUrlSchema's 7_000_000-character maximum.
  const prefix = 'data:image/jpeg;base64,';
  const nearCeiling = prefix + 'A'.repeat(6_999_000 - prefix.length);

  it.each(scanImageRoutes)(
    '%s reads an image over the default limit as an image, not a body-limit refusal',
    async (route, field) => {
      const over = prefix + 'A'.repeat(DEFAULT_REQUEST_BODY_BYTES * 2);
      const res = await client(app, cookie, '/api/scan').post(route, {
        [field]: over,
      });
      expect(res.status).not.toBe(413);
    },
  );

  it.each(scanImageRoutes)(
    '%s takes an image near the 7 MB image ceiling',
    async (route, field) => {
      const res = await client(app, cookie, '/api/scan').post(route, {
        [field]: nearCeiling,
      });
      expect(res.status).not.toBe(413);
    },
  );

  it.each([['/plate/recipe'], ['/receipt/confirm']])(
    '%s stays on the default limit and refuses a larger JSON body with 413',
    async (route) => {
      const res = await client(app, cookie, '/api/scan').post(route, {
        filler: 'x'.repeat(DEFAULT_REQUEST_BODY_BYTES + 1024),
      });
      expect(res.status).toBe(413);
    },
  );
});

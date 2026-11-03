import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { createTestApp } from './support/create-test-app';

// The mobile apps load the web app from local files, so the page's origin is
// not the API's, and WKWebView drops the cross-site session cookie. They sign
// in from these origins and send the session as a Bearer token instead.
const IOS_ORIGIN = 'capacitor://localhost';
const ANDROID_ORIGIN = 'https://localhost';

describe('Mobile app sessions (integration)', () => {
  let app: NestFastifyApplication;
  const password = 'correct-horse-battery-staple';

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function signUpFrom(origin: string) {
    const email = `native-${Date.now()}-${Math.random()}@example.com`;
    const response = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('origin', origin)
      .send({ name: 'Phone Member', email, password })
      .expect(200);
    return { email, response };
  }

  it.each([IOS_ORIGIN, ANDROID_ORIGIN])(
    'signs in from %s and uses the session as a Bearer token, with no cookie',
    async (origin) => {
      const { email } = await signUpFrom(origin);
      const signIn = await request(app.getHttpServer())
        .post('/api/auth/sign-in/email')
        .set('origin', origin)
        .send({ email, password })
        .expect(200);
      expect(signIn.headers['access-control-allow-origin']).toBe(origin);
      expect(signIn.headers['access-control-expose-headers']).toContain(
        'set-auth-token',
      );
      const token = signIn.headers['set-auth-token'];
      expect(token).toEqual(expect.any(String));

      const session = await request(app.getHttpServer())
        .get('/api/auth/get-session')
        .set('origin', origin)
        .set('authorization', `Bearer ${token}`)
        .expect(200);
      expect((session.body as { user: { email: string } }).user.email).toBe(
        email,
      );

      // A guarded API route accepts it too.
      await request(app.getHttpServer())
        .get('/api/family')
        .set('origin', origin)
        .set('authorization', `Bearer ${token}`)
        .expect(200);
    },
  );

  it('answers the preflight from the apps, allowing the Authorization header', async () => {
    const preflight = await request(app.getHttpServer())
      .options('/api/family')
      .set('origin', IOS_ORIGIN)
      .set('access-control-request-method', 'GET')
      .set('access-control-request-headers', 'authorization')
      .expect(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(IOS_ORIGIN);
    expect(
      preflight.headers['access-control-allow-headers']?.toLowerCase(),
    ).toContain('authorization');
  });

  it('refuses a forged or unsigned Bearer token', async () => {
    const { response } = await signUpFrom(IOS_ORIGIN);
    const token = response.headers['set-auth-token'];
    const [rawToken] = token.split('.');

    for (const forged of [rawToken, `${rawToken}.not-the-signature`]) {
      await request(app.getHttpServer())
        .get('/api/family')
        .set('origin', IOS_ORIGIN)
        .set('authorization', `Bearer ${forged}`)
        .expect(401);
    }
  });

  it('ends the Bearer session on sign-out', async () => {
    const { response } = await signUpFrom(ANDROID_ORIGIN);
    const token = response.headers['set-auth-token'];

    await request(app.getHttpServer())
      .post('/api/auth/sign-out')
      .set('origin', ANDROID_ORIGIN)
      .set('authorization', `Bearer ${token}`)
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/family')
      .set('origin', ANDROID_ORIGIN)
      .set('authorization', `Bearer ${token}`)
      .expect(401);
  });

  // Better Auth's own origin check is off under NODE_ENV=test; config/origins.spec.ts covers the matcher.
  it('still refuses CORS from origins that are not ours', async () => {
    const preflight = await request(app.getHttpServer())
      .options('/api/family')
      .set('origin', 'https://localhost.evil.com')
      .set('access-control-request-method', 'GET');
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
  });
});

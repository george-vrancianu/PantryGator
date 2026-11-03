import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DATABASE } from '../../src/database/database.constants';
import type { Database } from '../../src/database/database.types';
import {
  creditEntry,
  family,
  promoCode,
  user,
} from '../../src/database/schema';

// Not imported from create-test-app: the signup specs set env before loading AppModule.
const TEST_ORIGIN = 'http://localhost:5173';

let counter = 0;

/** Raw signup (no assertions). Our limiters key on the socket IP (no TRUSTED_CLIENT_IP_HEADER in tests), so every call here shares one Promo Code IP budget; Better Auth's own limiter is off under test. */
export function rawSignUp(
  app: NestFastifyApplication,
  body: { promoCode?: string; joinInviteCode?: string } = {},
  email = `signup-${Date.now()}-${++counter}@example.com`,
) {
  return request(app.getHttpServer())
    .post('/api/auth/sign-up/email')
    .set('origin', TEST_ORIGIN)
    .set(
      'x-forwarded-for',
      `10.55.${counter % 250}.${Math.floor(counter / 250)}`,
    )
    .send({
      name: 'New Member',
      email,
      password: 'correct-horse-battery-staple',
      ...body,
    })
    .then((res) => ({ res, email }));
}

export function sessionCookie(res: request.Response): string {
  return [res.headers['set-cookie'] ?? []]
    .flat()
    .map((value) => value.split(';')[0])
    .join('; ');
}

export function newPromoCode(
  app: NestFastifyApplication,
  credits: number,
  state: 'unused' | 'revoked' = 'unused',
) {
  const db = app.get<Database>(DATABASE);
  const code = Array.from(
    { length: 10 },
    () => 'ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(Math.random() * 23)],
  ).join('');
  return db
    .insert(promoCode)
    .values({
      code,
      credits,
      revokedAt: state === 'revoked' ? new Date() : null,
    })
    .then(() => code);
}

/** What signup left behind for an email. */
export async function footprint(app: NestFastifyApplication, email: string) {
  const db = app.get<Database>(DATABASE);
  const [member] = await db.select().from(user).where(eq(user.email, email));
  const entries = member
    ? await db
        .select()
        .from(creditEntry)
        .where(eq(creditEntry.familyId, member.familyId))
    : [];
  const families = member
    ? await db.select().from(family).where(eq(family.id, member.familyId))
    : [];
  return { member, entries, families };
}

export async function promoRow(app: NestFastifyApplication, code: string) {
  const db = app.get<Database>(DATABASE);
  const [row] = await db
    .select()
    .from(promoCode)
    .where(eq(promoCode.code, code));
  return row;
}

export async function familyCount(app: NestFastifyApplication) {
  const db = app.get<Database>(DATABASE);
  return (await db.select({ id: family.id }).from(family)).length;
}

/** A Family (its Owner signed up the normal way) and its Invite Code, to join at signup. */
export async function familyToJoin(app: NestFastifyApplication) {
  const { email } = await rawSignUp(app);
  const { member, families } = await footprint(app, email);
  return {
    familyId: families[0].id,
    inviteCode: families[0].inviteCode,
    owner: member,
  };
}

export async function membersOf(app: NestFastifyApplication, familyId: string) {
  const db = app.get<Database>(DATABASE);
  return db.select().from(user).where(eq(user.familyId, familyId));
}

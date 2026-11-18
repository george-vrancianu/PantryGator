import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, inArray, sql } from 'drizzle-orm';
import request from 'supertest';
import { DATABASE } from '../src/database/database.constants';
import type { Database } from '../src/database/database.types';
import {
  aisles,
  batches,
  family,
  leafCategories,
  parentCategories,
  recipeDrafts,
  shoppingItems,
  shoppingLists,
  user,
} from '../src/database/schema';
import { createTestApp, TEST_ORIGIN } from './support/create-test-app';

type FamilyBody = {
  id: string;
  inviteCode: string;
  inviteCodeExpiresAt: string;
  members: Array<{ id: string; name: string; isOwner: boolean }>;
  currentMemberIsOwner: boolean;
};

describe('Family membership: join, leave, remove, transfer, delete (integration)', () => {
  let app: NestFastifyApplication;
  let database: Database;

  beforeAll(async () => {
    app = await createTestApp();
    database = app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await app.close();
  });

  const password = 'correct-horse-battery-staple';
  let counter = 0;
  type Who = { cookie: string; userId: string };

  async function signUp(name: string): Promise<Who> {
    const n = ++counter;
    const response = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('origin', TEST_ORIGIN)
      .set('x-forwarded-for', `10.8.${Math.floor(n / 250)}.${n % 250}`)
      .send({
        name,
        email: `membership-${Date.now()}-${n}@example.com`,
        password,
      })
      .expect(200);
    const cookie = [response.headers['set-cookie'] ?? []]
      .flat()
      .map((c) => c.split(';')[0])
      .join('; ');
    return {
      cookie,
      userId: (response.body as { user: { id: string } }).user.id,
    };
  }

  const call = (
    who: Who,
    method: 'get' | 'post' | 'delete',
    path: string,
    body?: object,
  ) => {
    const req = request(app.getHttpServer())
      [method](`/api/family${path}`)
      .set('origin', TEST_ORIGIN)
      .set('cookie', who.cookie);
    return method === 'post' ? req.send(body ?? {}) : req;
  };

  const codeOf = (res: { body: unknown }) =>
    (res.body as { code: string }).code;

  const familyOf = async (who: Who) =>
    (await call(who, 'get', '').expect(200)).body as FamilyBody;

  const rowOf = async (who: Who) =>
    (await database.select().from(user).where(eq(user.id, who.userId)))[0];

  const familyExists = async (id: string) =>
    (await database.select().from(family).where(eq(family.id, id))).length > 0;

  /** An Owner with `count` further Members in their Family. */
  async function familyWith(count: number) {
    const owner = await signUp('Owner');
    const code = (await familyOf(owner)).inviteCode;
    const members: Who[] = [];
    for (let i = 0; i < count; i++) {
      const m = await signUp(`Member${i}`);
      await call(m, 'post', '/join', { code }).expect(201);
      members.push(m);
    }
    return { owner, members, familyId: (await familyOf(owner)).id };
  }

  describe('join', () => {
    it('moves a Household of One into the Family and deletes the old one', async () => {
      const owner = await signUp('Owner');
      const joiner = await signUp('Joiner');
      const { inviteCode, id } = await familyOf(owner);
      const abandoned = (await familyOf(joiner)).id;

      const joined = (
        await call(joiner, 'post', '/join', { code: inviteCode }).expect(201)
      ).body as FamilyBody;
      expect(joined.id).toBe(id);
      expect(joined.currentMemberIsOwner).toBe(false);
      expect(joined.members.map((m) => m.name)).toEqual(['Owner', 'Joiner']);
      expect(await familyExists(abandoned)).toBe(false);
    });

    it('accepts the code case-insensitively, and keeps it reusable', async () => {
      const owner = await signUp('Owner');
      const { inviteCode } = await familyOf(owner);
      const a = await signUp('A');
      const b = await signUp('B');
      await call(a, 'post', '/join', {
        code: ` ${inviteCode.toLowerCase()} `,
      }).expect(201);
      await call(b, 'post', '/join', { code: inviteCode }).expect(201);
      expect((await familyOf(owner)).members).toHaveLength(3);
    });

    it('previews what will be deleted without changing anything', async () => {
      const owner = await signUp('Owner');
      const joiner = await signUp('Joiner');
      const before = await familyOf(joiner);
      const preview = await call(
        joiner,
        'get',
        `/join-preview?code=${(await familyOf(owner)).inviteCode}`,
      ).expect(200);
      expect(preview.body).toEqual({
        batches: 0,
        shoppingItems: 0,
        recipeDrafts: 0,
      });
      expect((await familyOf(joiner)).id).toBe(before.id);
    });

    it('rejects unknown, expired, and own-Family codes with distinct codes', async () => {
      const owner = await signUp('Owner');
      const joiner = await signUp('Joiner');
      const { inviteCode, id } = await familyOf(owner);

      const unknown = await call(joiner, 'post', '/join', {
        code: 'ZZZZZZZZ',
      }).expect(404);
      expect(unknown.body).toEqual({
        code: 'family.invite_code_invalid',
        params: {},
      });

      const own = await call(owner, 'post', '/join', {
        code: inviteCode,
      }).expect(409);
      expect(codeOf(own)).toBe('family.already_member');

      await database
        .update(family)
        .set({ inviteCodeExpiresAt: new Date(Date.now() - 1000) })
        .where(eq(family.id, id));
      const expired = await call(joiner, 'post', '/join', {
        code: inviteCode,
      }).expect(410);
      expect(codeOf(expired)).toBe('family.invite_code_expired');
      await call(joiner, 'get', `/join-preview?code=${inviteCode}`).expect(410);
    });

    it('rejects a revoked (regenerated) code', async () => {
      const owner = await signUp('Owner');
      const joiner = await signUp('Joiner');
      const old = (await familyOf(owner)).inviteCode;
      await call(owner, 'post', '/invite-code/regenerate').expect(201);
      await call(joiner, 'post', '/join', { code: old }).expect(404);
    });

    it('rejects a Member whose current Family has other Members', async () => {
      const { owner, members } = await familyWith(1);
      const other = await signUp('Other');
      const code = (await familyOf(other)).inviteCode;

      for (const who of [owner, members[0]]) {
        const res = await call(who, 'post', '/join', { code }).expect(409);
        expect(codeOf(res)).toBe('family.not_household_of_one');
      }
      await call(owner, 'get', `/join-preview?code=${code}`).expect(409);
      expect((await familyOf(other)).members).toHaveLength(1);
    });

    it('validates the body', async () => {
      const who = await signUp('Who');
      await call(who, 'post', '/join', {}).expect(400);
      await call(who, 'get', '/join-preview').expect(400);
    });

    it('lets only one of two concurrent joins by the same Member through', async () => {
      const a = await signUp('OwnerA');
      const b = await signUp('OwnerB');
      const joiner = await signUp('Joiner');
      const codeA = (await familyOf(a)).inviteCode;
      const codeB = (await familyOf(b)).inviteCode;

      const results = await Promise.all([
        call(joiner, 'post', '/join', { code: codeA }),
        call(joiner, 'post', '/join', { code: codeB }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const landed = await familyOf(joiner);
      expect([(await familyOf(a)).id, (await familyOf(b)).id]).toContain(
        landed.id,
      );
      expect(landed.members.map((m) => m.name)).toContain('Joiner');
    });

    it('survives two Owners joining each other concurrently without deadlock', async () => {
      const a = await signUp('A');
      const b = await signUp('B');
      const codeA = (await familyOf(a)).inviteCode;
      const codeB = (await familyOf(b)).inviteCode;
      const results = await Promise.all([
        call(a, 'post', '/join', { code: codeB }),
        call(b, 'post', '/join', { code: codeA }),
      ]);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      const fa = await familyOf(a);
      const fb = await familyOf(b);
      expect(fa.id).toBe(fb.id);
      expect(fa.members).toHaveLength(2);
      expect(fa.members.filter((m) => m.isOwner)).toHaveLength(1);
    });

    it('does not let a join into a Family race its deletion', async () => {
      const { owner, familyId } = await familyWith(0);
      const joiner = await signUp('Joiner');
      const code = (await familyOf(owner)).inviteCode;
      const results = await Promise.all([
        call(owner, 'delete', ''),
        call(joiner, 'post', '/join', { code }),
      ]);
      // Either order is consistent: joiner is never stranded in a deleted Family.
      expect(results[0].status).toBe(200);
      const row = await rowOf(joiner);
      expect(await familyExists(row.familyId)).toBe(true);
      if (results[1].status === 201) {
        // Joined first, so the deletion made them a Household of One too.
        expect(row.familyId).not.toBe(familyId);
      } else {
        expect(codeOf(results[1])).toBe('family.invite_code_invalid');
      }
      expect(await familyExists(familyId)).toBe(false);
    });
  });

  describe('leave', () => {
    it('gives the leaver a fresh Household of One and leaves the rest intact', async () => {
      const { owner, members, familyId } = await familyWith(2);
      const leaver = members[0];

      const after = (await call(leaver, 'post', '/leave').expect(200))
        .body as FamilyBody;
      expect(after.id).not.toBe(familyId);
      expect(after.members).toEqual([
        { id: leaver.userId, name: 'Member0', isOwner: true },
      ]);
      expect(after.currentMemberIsOwner).toBe(true);
      expect(after.inviteCode).not.toBe((await familyOf(owner)).inviteCode);
      const remaining = await familyOf(owner);
      expect(remaining.id).toBe(familyId);
      expect(remaining.members.map((m) => m.name)).toEqual([
        'Owner',
        'Member1',
      ]);
    });

    it('refuses the Owner, even when alone', async () => {
      const { owner } = await familyWith(1);
      const denied = await call(owner, 'post', '/leave').expect(409);
      expect(denied.body).toEqual({
        code: 'family.owner_cannot_leave',
        params: {},
      });
      const solo = await signUp('Solo');
      await call(solo, 'post', '/leave').expect(409);
    });

    it('can rejoin after leaving', async () => {
      const { owner, members } = await familyWith(1);
      const { inviteCode } = await familyOf(owner);
      await call(members[0], 'post', '/leave').expect(200);
      await call(members[0], 'post', '/join', { code: inviteCode }).expect(201);
      expect((await familyOf(owner)).members).toHaveLength(2);
    });

    it('does not let a Member leave twice concurrently into two Families', async () => {
      const { members, familyId } = await familyWith(1);
      const results = await Promise.all([
        call(members[0], 'post', '/leave'),
        call(members[0], 'post', '/leave'),
      ]);
      // The loser re-reads under the lock, finds itself Owner of its new Household of One, and is refused.
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const row = await rowOf(members[0]);
      expect(row.familyId).not.toBe(familyId);
      const mine = await database
        .select()
        .from(user)
        .where(eq(user.familyId, row.familyId));
      expect(mine).toHaveLength(1);
    });
  });

  describe('remove', () => {
    it('lets the Owner remove a Member into a fresh Household of One', async () => {
      const { owner, members, familyId } = await familyWith(2);
      const result = (
        await call(owner, 'delete', `/members/${members[0].userId}`).expect(200)
      ).body as FamilyBody;
      expect(result.id).toBe(familyId);
      expect(result.members.map((m) => m.name)).toEqual(['Owner', 'Member1']);

      const removed = await familyOf(members[0]);
      expect(removed.id).not.toBe(familyId);
      expect(removed.currentMemberIsOwner).toBe(true);
      expect(removed.members).toHaveLength(1);
    });

    it('rejects non-Owners, self-removal, and Members of other Families', async () => {
      const { owner, members } = await familyWith(2);
      const stranger = await signUp('Stranger');

      const denied = await call(
        members[0],
        'delete',
        `/members/${members[1].userId}`,
      ).expect(403);
      expect(codeOf(denied)).toBe('family.owner_required');
      expect((await familyOf(owner)).members).toHaveLength(3);

      const self = await call(
        owner,
        'delete',
        `/members/${owner.userId}`,
      ).expect(400);
      expect(codeOf(self)).toBe('family.cannot_remove_self');

      const other = await call(
        owner,
        'delete',
        `/members/${stranger.userId}`,
      ).expect(404);
      expect(codeOf(other)).toBe('family.member_not_found');
      await call(owner, 'delete', '/members/nobody').expect(404);
      expect((await familyOf(stranger)).members).toHaveLength(1);
    });

    it('is race-safe against the target leaving at the same moment', async () => {
      const { owner, members, familyId } = await familyWith(1);
      const results = await Promise.all([
        call(owner, 'delete', `/members/${members[0].userId}`),
        call(members[0], 'post', '/leave'),
      ]);
      // Whichever wins, the Member ends in exactly one fresh Household of One.
      expect(results.map((r) => r.status).filter((s) => s >= 500)).toEqual([]);
      const row = await rowOf(members[0]);
      expect(row.familyId).not.toBe(familyId);
      expect(row.familyRole).toBe('owner');
      expect((await familyOf(owner)).members).toHaveLength(1);
    });
  });

  describe('transfer ownership', () => {
    it('hands ownership over, leaving exactly one Owner', async () => {
      const { owner, members, familyId } = await familyWith(1);
      const result = (
        await call(owner, 'post', '/transfer-ownership', {
          memberId: members[0].userId,
        }).expect(200)
      ).body as FamilyBody;
      expect(result.currentMemberIsOwner).toBe(false);
      expect(result.members.map((m) => [m.name, m.isOwner])).toEqual([
        ['Member0', true],
        ['Owner', false],
      ]);
      expect((await familyOf(members[0])).currentMemberIsOwner).toBe(true);
      const owners = await database
        .select()
        .from(user)
        .where(eq(user.familyId, familyId));
      expect(owners.filter((o) => o.familyRole === 'owner')).toHaveLength(1);
    });

    it('lets the previous Owner leave afterwards, and the new Owner act', async () => {
      const { owner, members } = await familyWith(1);
      await call(owner, 'post', '/transfer-ownership', {
        memberId: members[0].userId,
      }).expect(200);
      await call(owner, 'post', '/leave').expect(200);
      await call(owner, 'post', '/invite-code/regenerate').expect(201);
      await call(members[0], 'post', '/invite-code/regenerate').expect(201);
    });

    it('rejects non-Owners, self, and people outside the Family', async () => {
      const { owner, members } = await familyWith(2);
      const stranger = await signUp('Stranger');

      const denied = await call(members[0], 'post', '/transfer-ownership', {
        memberId: members[1].userId,
      }).expect(403);
      expect(codeOf(denied)).toBe('family.owner_required');
      const self = await call(owner, 'post', '/transfer-ownership', {
        memberId: owner.userId,
      }).expect(400);
      expect(codeOf(self)).toBe('family.cannot_transfer_to_self');
      const outside = await call(owner, 'post', '/transfer-ownership', {
        memberId: stranger.userId,
      }).expect(404);
      expect(codeOf(outside)).toBe('family.member_not_found');
      await call(owner, 'post', '/transfer-ownership', {}).expect(400);
      expect((await familyOf(owner)).currentMemberIsOwner).toBe(true);
    });

    it('does not lose or duplicate the Owner when the target leaves concurrently', async () => {
      const { owner, members, familyId } = await familyWith(1);
      const results = await Promise.all([
        call(owner, 'post', '/transfer-ownership', {
          memberId: members[0].userId,
        }),
        call(members[0], 'post', '/leave'),
      ]);
      expect(results.map((r) => r.status).filter((s) => s >= 500)).toEqual([]);
      const rows = await database
        .select()
        .from(user)
        .where(inArray(user.id, [owner.userId, members[0].userId]));
      const byFamily = new Map<string, string[]>();
      for (const r of rows) {
        byFamily.set(r.familyId, [
          ...(byFamily.get(r.familyId) ?? []),
          r.familyRole,
        ]);
      }
      for (const roles of byFamily.values()) {
        expect(roles.filter((r) => r === 'owner')).toHaveLength(1);
      }
      expect((await rowOf(owner)).familyId).toBeDefined();
      // Never an ownerless Family.
      const ownerless = await database.execute(
        sql`select count(*)::int as n from family f where f.id = ${familyId}
            and not exists (select 1 from "user" u where u.family_id = f.id and u.family_role = 'owner')`,
      );
      expect((ownerless.rows[0] as { n: number }).n).toBe(0);
    });
  });

  describe('delete Family', () => {
    it('deletes the Family and gives every former Member a fresh Household of One', async () => {
      const { owner, members, familyId } = await familyWith(2);
      const result = (await call(owner, 'delete', '').expect(200))
        .body as FamilyBody;
      expect(await familyExists(familyId)).toBe(false);
      expect(result.members).toEqual([
        { id: owner.userId, name: 'Owner', isOwner: true },
      ]);

      const familyIds = new Set<string>([result.id]);
      for (const m of members) {
        const f = await familyOf(m);
        expect(f.members).toHaveLength(1);
        expect(f.currentMemberIsOwner).toBe(true);
        familyIds.add(f.id);
      }
      expect(familyIds.size).toBe(3);
      expect(familyIds.has(familyId)).toBe(false);
    });

    it('works for a Household of One, which resets it', async () => {
      const solo = await signUp('Solo');
      const before = await familyOf(solo);
      const after = (await call(solo, 'delete', '').expect(200))
        .body as FamilyBody;
      expect(after.id).not.toBe(before.id);
      expect(await familyExists(before.id)).toBe(false);
    });

    it('rejects non-Owners and leaves the Family untouched', async () => {
      const { owner, members, familyId } = await familyWith(1);
      const denied = await call(members[0], 'delete', '').expect(403);
      expect(codeOf(denied)).toBe('family.owner_required');
      expect((await familyOf(owner)).id).toBe(familyId);
    });

    it('requires a session for every membership route', async () => {
      const api = request(app.getHttpServer());
      await api.post('/api/family/join').send({ code: 'ABCDEFGH' }).expect(401);
      await api.get('/api/family/join-preview?code=ABCDEFGH').expect(401);
      await api.post('/api/family/leave').send({}).expect(401);
      await api
        .post('/api/family/transfer-ownership')
        .send({ memberId: 'x' })
        .expect(401);
      await api.delete('/api/family/members/x').expect(401);
      await api.delete('/api/family').expect(401);
    });
  });

  describe('Family-owned data', () => {
    let leafId: string;

    beforeAll(async () => {
      const tag = `fm${Date.now()}${Math.floor(Math.random() * 1e6)}`;
      const [aisle] = await database
        .insert(aisles)
        .values({
          id: randomUUID(),
          name: tag,
          normalizedName: tag,
          sortOrder: 100_000 + Math.floor(Math.random() * 1_000_000),
        })
        .returning();
      const [parent] = await database
        .insert(parentCategories)
        .values({
          id: randomUUID(),
          name: tag,
          normalizedName: tag,
          aisleId: aisle.id,
        })
        .returning();
      const [leaf] = await database
        .insert(leafCategories)
        .values({
          id: randomUUID(),
          parentId: parent.id,
          name: tag,
          normalizedName: tag,
        })
        .returning();
      leafId = leaf.id;
    });

    /** 3 Batches and 4 Shopping Items (2 active, 2 on an archived list). */
    async function seed(familyId: string) {
      await database.insert(batches).values(
        [1, 2, 3].map((n) => ({
          familyId,
          leafCategoryId: leafId,
          unmatched: true,
          rawName: `thing ${n}`,
          location: 'cupboard' as const,
        })),
      );
      const [active] = await database
        .insert(shoppingLists)
        .values({ familyId })
        .returning();
      const [archived] = await database
        .insert(shoppingLists)
        .values({ familyId, status: 'archived' })
        .returning();
      await database.insert(shoppingItems).values(
        [active.id, active.id, archived.id, archived.id].map((listId, n) => ({
          listId,
          name: `item ${n}`,
          normalizedName: `item ${n}`,
        })),
      );
    }

    const dataOf = async (familyId: string) => {
      const b = await database
        .select()
        .from(batches)
        .where(eq(batches.familyId, familyId));
      const lists = await database
        .select()
        .from(shoppingLists)
        .where(eq(shoppingLists.familyId, familyId));
      const items = lists.length
        ? await database
            .select()
            .from(shoppingItems)
            .where(
              inArray(
                shoppingItems.listId,
                lists.map((l) => l.id),
              ),
            )
        : [];
      return { batches: b.length, lists: lists.length, items: items.length };
    };

    it('cascades every foreign key referencing family, except user.family_id and the Usage Record link', async () => {
      const result = await database.execute(sql`
        select cl.relname as table_name, rc.delete_rule
        from information_schema.referential_constraints rc
        join pg_constraint c on c.conname = rc.constraint_name
        join pg_class cl on cl.oid = c.conrelid
        join pg_class ref on ref.oid = c.confrelid
        where ref.relname = 'family' and c.contype = 'f'`);
      const rules = result.rows as Array<{
        table_name: string;
        delete_rule: string;
      }>;
      const byTable = Object.fromEntries(
        rules.map((r) => [r.table_name, r.delete_rule]),
      );
      expect(byTable['user']).toBe('NO ACTION');
      // Usage Records outlive their Family: the link is cleared, not cascaded (ADR 0032).
      expect(byTable['usage_record']).toBe('SET NULL');
      expect(byTable['batches']).toBe('CASCADE');
      expect(byTable['shopping_lists']).toBe('CASCADE');
      expect(
        rules.filter(
          (r) =>
            r.table_name !== 'user' &&
            r.table_name !== 'usage_record' &&
            r.delete_rule !== 'CASCADE',
        ),
      ).toEqual([]);
    });

    it('shows real counts in the join warning, then deletes the abandoned data on join', async () => {
      const owner = await signUp('Owner');
      const joiner = await signUp('Joiner');
      const mine = (await familyOf(joiner)).id;
      await seed(mine);
      // Recipe Drafts end with the move too (ADR 0028), so the warning counts them.
      await database.insert(recipeDrafts).values(
        [1, 2].map(() => ({
          id: randomUUID(),
          memberId: joiner.userId,
          familyId: mine,
          kind: 'new_recipe' as const,
          content: { title: 'Half a stew' } as never,
        })),
      );
      // One past its 30 days but not yet swept (expiry is lazy): already lost, so not counted.
      await database.insert(recipeDrafts).values({
        id: randomUUID(),
        memberId: joiner.userId,
        familyId: mine,
        kind: 'new_recipe' as const,
        content: { title: 'Old stew' } as never,
        updatedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      });

      const code = (await familyOf(owner)).inviteCode;
      const preview = await call(
        joiner,
        'get',
        `/join-preview?code=${code}`,
      ).expect(200);
      expect(preview.body).toEqual({
        batches: 3,
        shoppingItems: 4,
        recipeDrafts: 2,
      });
      expect(await dataOf(mine)).toEqual({ batches: 3, lists: 2, items: 4 });

      await call(joiner, 'post', '/join', { code }).expect(201);
      expect(await familyExists(mine)).toBe(false);
      expect(await dataOf(mine)).toEqual({ batches: 0, lists: 0, items: 0 });
      expect(
        await database
          .select()
          .from(recipeDrafts)
          .where(eq(recipeDrafts.memberId, joiner.userId)),
      ).toEqual([]);
    });

    it('leaves the target Family data alone when someone joins', async () => {
      const owner = await signUp('Owner');
      const joiner = await signUp('Joiner');
      const { id, inviteCode } = await familyOf(owner);
      await seed(id);
      await call(joiner, 'post', '/join', { code: inviteCode }).expect(201);
      expect(await dataOf(id)).toEqual({ batches: 3, lists: 2, items: 4 });
    });

    it('deletes all Family data with the Family and keeps the Members', async () => {
      const { owner, members, familyId } = await familyWith(1);
      await seed(familyId);
      await call(owner, 'delete', '').expect(200);
      expect(await familyExists(familyId)).toBe(false);
      expect(await dataOf(familyId)).toEqual({
        batches: 0,
        lists: 0,
        items: 0,
      });
      const fresh = await familyOf(members[0]);
      expect(await dataOf(fresh.id)).toEqual({
        batches: 0,
        lists: 0,
        items: 0,
      });
    });

    it('leaves Family data with the Family when a Member leaves or is removed', async () => {
      const { owner, members, familyId } = await familyWith(2);
      await seed(familyId);
      await call(members[0], 'post', '/leave').expect(200);
      await call(owner, 'delete', `/members/${members[1].userId}`).expect(200);
      expect(await dataOf(familyId)).toEqual({
        batches: 3,
        lists: 2,
        items: 4,
      });
      expect(await dataOf((await familyOf(members[0])).id)).toEqual({
        batches: 0,
        lists: 0,
        items: 0,
      });
    });
  });

  it('reads the role from the database, not the session', async () => {
    const { owner, members } = await familyWith(1);
    // The Owner's session predates this demotion.
    await call(owner, 'post', '/transfer-ownership', {
      memberId: members[0].userId,
    }).expect(200);
    await call(owner, 'delete', '').expect(403);
    await call(owner, 'delete', `/members/${members[0].userId}`).expect(403);
  });
});

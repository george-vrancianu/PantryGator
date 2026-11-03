import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import { allowedOrigins, isAllowedOrigin } from '../config/origins';
import type { Database } from '../database/database.types';
import * as schema from '../database/schema';
import { CLIENT_IP_HEADER } from './register-auth-handler';
import {
  exposeSignupTransaction,
  linkSignupRedemption,
  OPEN_SIGNUP,
  placeNewMember,
  type SignupPolicy,
} from './signup';

export type CreateAuthOptions = {
  baseURL: string;
  secret: string;
  clientOrigin: string;
  /** Default: signup open, Welcome Grant, optional Promo Code (the seed and tests). */
  signup?: SignupPolicy;
  /**
   * Better Auth's own per-IP rate limit (sign-in and sign-up: 3 per 10 s). Default on.
   * The API turns it off under NODE_ENV=test, where every request comes from one IP.
   */
  rateLimit?: boolean;
};

/** The Better Auth instance; shared by AuthModule and the dev seed. */
export function createAuth(database: Database, options: CreateAuthOptions) {
  return betterAuth({
    appName: 'PantryGator',
    baseURL: options.baseURL,
    basePath: '/api/auth',
    secret: options.secret,
    database: drizzleAdapter(exposeSignupTransaction(database), {
      provider: 'pg',
      schema,
      // Sign-up runs in one transaction so the Family created by the
      // hook below rolls back if the user insert fails.
      transaction: true,
    }),
    emailAndPassword: { enabled: true },
    plugins: [
      // The mobile apps cannot keep the session cookie (WKWebView drops it across
      // sites), so they send it back as `Authorization: Bearer` (ADR 0036). Only the
      // signed value from `set-auth-token` is accepted.
      bearer({ requireSignature: true }),
      {
        // Registers our Family table as a Better Auth model so the hook
        // can write it through the sign-up transaction adapter. The
        // Drizzle schema (database/schema.ts) is the source of truth for
        // these columns; keep them in sync.
        id: 'family-model',
        schema: {
          family: {
            fields: {
              inviteCode: { type: 'string', required: true },
              inviteCodeExpiresAt: { type: 'date', required: true },
            },
          },
          // Same for the Credit ledger, which the Welcome Grant is written to.
          creditEntry: {
            fields: {
              familyId: { type: 'string', required: true },
              kind: { type: 'string', required: true },
              reason: { type: 'string', required: false },
              amount: { type: 'number', required: true },
            },
          },
        },
      },
    ],
    user: {
      additionalFields: {
        // Read-only for clients and never set at signup: Admin is granted
        // only directly in the database (see README, "Admin access").
        role: { type: 'string', defaultValue: 'regular', input: false },
        // Set by the signup hook below, never by clients (the column is NOT NULL).
        familyId: { type: 'string', required: false, input: false },
        familyRole: {
          type: 'string',
          defaultValue: 'member',
          input: false,
        },
        // Set by the signup hook below with the Welcome Grant, never by clients.
        welcomeGrantAt: { type: 'date', required: false, input: false },
      },
    },
    databaseHooks: {
      // Runs in the signup transaction right after the user insert: names the Member on a Promo Code
      // redeemed at signup (the Credit history shows who redeemed it).
      account: {
        create: {
          before: async (account) => {
            await linkSignupRedemption(account.userId);
          },
        },
      },
      user: {
        create: {
          // Signing up places the Member in a Household of One as Owner (see placeNewMember for the
          // Welcome Grant / Promo Code rules). Written through the sign-up transaction (and refused
          // outside one), so it is atomic with the user insert.
          before: async (newUser, context) => {
            const body = context?.body as
              { promoCode?: unknown; joinInviteCode?: unknown } | undefined;
            const placement = await placeNewMember(
              newUser,
              {
                promoCode:
                  typeof body?.promoCode === 'string'
                    ? body.promoCode
                    : undefined,
                joinInviteCode:
                  typeof body?.joinInviteCode === 'string'
                    ? body.joinInviteCode
                    : undefined,
                ip: context?.headers?.get(CLIENT_IP_HEADER) ?? 'unknown',
              },
              options.signup ?? OPEN_SIGNUP,
            );
            return { data: { ...newUser, ...placement } };
          },
        },
      },
    },
    rateLimit: { enabled: options.rateLimit ?? true, window: 60, max: 100 },
    // Key the rate limit on our header, not x-forwarded-for: behind a proxy that
    // header has several entries (Better Auth then finds no IP) or a client-chosen one.
    advanced: { ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] } },
    // Function form so our strict matcher governs, not better-auth's
    // looser `*` wildcard (which matches `10.a.evil.com`).
    trustedOrigins: (request) => {
      const { clientOrigin } = options;
      const origin = request?.headers.get('origin');
      return origin && isAllowedOrigin(origin, allowedOrigins(clientOrigin))
        ? [clientOrigin, origin]
        : [clientOrigin];
    },
  });
}

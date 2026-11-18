import { lt, gte, sql } from 'drizzle-orm';
import { recipeDrafts } from '../database/schema';
import { RECIPE_DRAFT_TTL_DAYS } from './recipe-drafts.schemas';

const cutoff = sql`now() - make_interval(days => ${RECIPE_DRAFT_TTL_DAYS})`;

/** Not edited for 30 days: gone, though a row may linger (expiry is lazy). */
export const recipeDraftExpired = lt(recipeDrafts.updatedAt, cutoff);

/** Still within its 30 days: what a count of a Member's Recipe Drafts should see. */
export const recipeDraftLive = gte(recipeDrafts.updatedAt, cutoff);

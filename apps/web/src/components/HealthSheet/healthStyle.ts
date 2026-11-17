import { tokens } from '@pocket-pantry/ui';
import type { Verdict } from '../../lib/health';

/** Ring and bar colour of a verdict. The same thresholds colour each Health Factor's bar segment. */
export const VERDICT_COLOR: Record<Verdict, string> = {
  good: tokens.color.accent,
  some: tokens.color.star,
  attention: tokens.color.urgentFg,
};

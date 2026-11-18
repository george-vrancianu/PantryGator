import { palette } from '@pocket-pantry/ui';
import type { Verdict } from '@/lib/health';

/** Ring and bar colour of a verdict. The same thresholds colour each Health Factor's bar segment. */
export const VERDICT_COLOR: Record<Verdict, string> = {
  good: palette('pp-accent'),
  some: palette('pp-star'),
  attention: palette('error-main'),
};

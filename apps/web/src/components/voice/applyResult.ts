import type { TFunction } from 'i18next';
import type {
  VoiceApplyResult,
  VoiceDefaultTarget,
  VoiceList,
  VoiceReviewAction,
} from '@/lib/voice';
import { displayName, leadingList } from './reviewModel';

/** The longest the result names skipped actions before counting the rest. */
const NAMED_SKIPS = 2;

/** What the Member is told after Apply: the counts and skips, and a second line for what was already done. */
export type ApplyToast = { message: string; detail?: string };

const lower = (text: string, language: string) =>
  text.toLocaleLowerCase(language);

/**
 * The result toast. One list: "5 applied". Both: the page's list named first. Skips name the first two with
 * their reasons, then "+n". Already-satisfied actions count as applied and get a second line.
 */
export function applyToast(
  result: VoiceApplyResult,
  actions: VoiceReviewAction[],
  target: VoiceDefaultTarget,
  t: TFunction,
  language: string,
): ApplyToast {
  const count = result.applied.length;
  const byId = new Map(actions.map((a) => [a.id, a]));

  const skips = result.skipped.flatMap(({ id, reason }) => {
    const action = byId.get(id);
    return action
      ? [
          t('voice:toast.skippedItem', {
            name: lower(displayName(action), language),
            reason: t(`voice:skipReason.${reason}`, {
              defaultValue: t('voice:skipReason.other'),
            }),
          }),
        ]
      : [];
  });

  const page = leadingList(target);
  const per = (list: VoiceList) =>
    result.applied.filter((entry) => entry.list === list).length;
  const other: VoiceList = page === 'shopping' ? 'pantry' : 'shopping';

  const applied = t('voice:toast.applied', { count });
  let message: string;
  if (skips.length > 0) {
    // Deliberate: with skips the toast is "6 applied, 1 skipped: ..."; the per-list split is dropped to keep it short.
    const named = skips.slice(0, NAMED_SKIPS);
    if (skips.length > NAMED_SKIPS) {
      named.push(t('voice:toast.more', { count: skips.length - NAMED_SKIPS }));
    }
    message = t('voice:toast.skipped', {
      applied,
      // Count every skip, even one whose action Review no longer has a name for.
      skippedCount: t('voice:toast.skippedCount', {
        count: result.skipped.length,
      }),
      reasons: named.join(', '),
    });
  } else if (per(page) > 0 && per(other) > 0) {
    message = t('voice:toast.split', {
      applied,
      here: per(page),
      hereList: t(`voice:toast.where.${page}`),
      there: per(other),
      thereList: t(`voice:toast.where.${other}`),
    });
  } else {
    message = applied;
  }

  const already = result.applied.flatMap((entry) => {
    if (!entry.alreadyDone) return [];
    const action = byId.get(entry.actionId);
    return action ? [action] : [];
  });
  if (already.length === 0) return { message };
  const name = displayName(already[0]);
  const detail =
    already.length === 1
      ? t('voice:toast.already', {
          name,
          state: t(`voice:toast.alreadyState.${already[0].op}`, {
            defaultValue: t('voice:toast.alreadyState.other'),
          }),
        })
      : t('voice:toast.alreadyMany', { name, count: already.length - 1 });
  return { message, detail };
}

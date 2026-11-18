import { describe, expect, it } from 'vitest';
import { createI18n } from '@/i18n/index';
import type { VoiceApplyResult, VoiceReviewAction } from '@/lib/voice';
import { applyToast } from './applyResult';

const act = (id: string, name: string) =>
  ({
    id,
    op: 'add',
    target: 'pantry',
    text: name,
    name,
    ingredient: null,
  }) as unknown as VoiceReviewAction;

const done = (actionId: string, list: 'shopping' | 'pantry' = 'pantry') => ({
  actionId,
  list,
  alreadyDone: false,
});

const toast = (locale: 'en' | 'ro', result: VoiceApplyResult) => {
  const i18n = createI18n(locale);
  return applyToast(
    result,
    [act('a1', 'Milk'), act('a2', 'Eggs')],
    'pantry',
    i18n.t,
    locale,
  ).message;
};

describe('applyToast plurals', () => {
  it('counts one skip and many skips in English', () => {
    const one = { applied: [done('a3')], skipped: [{ id: 'a1', reason: 'x' }] };
    expect(toast('en', one)).toMatch(/^1 applied, 1 skipped: milk/);
  });

  it('agrees the skipped count in Romanian: one, few and other', () => {
    const skip = (id: string) => ({ id, reason: 'x' });
    const one = { applied: [done('a3')], skipped: [skip('a1')] };
    expect(toast('ro', one)).toMatch(
      /^1 modificare aplicată, 1 modificare omisă: /,
    );
    const few = {
      applied: [done('a3'), done('a4')],
      skipped: [skip('a1'), skip('a2')],
    };
    expect(toast('ro', few)).toMatch(
      /^2 modificări aplicate, 2 modificări omise: /,
    );
    const other = {
      applied: [done('a3')],
      skipped: Array.from({ length: 20 }, (_, i) =>
        skip(i < 2 ? `a${i + 1}` : `z${i}`),
      ),
    };
    expect(toast('ro', other)).toMatch(
      /^1 modificare aplicată, 20 de modificări omise: /,
    );
  });

  it('agrees the applied count in the Romanian both-lists toast', () => {
    const result = {
      applied: [done('a1'), done('a2', 'shopping')],
      skipped: [],
    };
    expect(toast('ro', result)).toMatch(
      /^2 modificări aplicate: 1 în cămară, 1 pe listă$/,
    );
  });
});

describe('applyToast off the lists', () => {
  it('names the Shopping List first when both lists changed and the page had none', () => {
    const i18n = createI18n('en');
    const { message } = applyToast(
      {
        applied: [done('a1', 'pantry'), done('a2', 'shopping')],
        skipped: [],
      },
      [act('a1', 'Milk'), act('a2', 'Eggs')],
      'none',
      i18n.t,
      'en',
    );
    expect(message).toBe('2 applied: 1 on the list, 1 in the Pantry');
  });
});

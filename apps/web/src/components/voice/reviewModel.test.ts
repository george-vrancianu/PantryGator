import { describe, expect, it } from 'vitest';
import type { VoiceReviewAction } from '@/lib/voice';
import { groupsOf } from './reviewModel';

const act = (id: string, target: 'shopping' | 'pantry') =>
  ({
    id,
    status: 'ready',
    op: 'add',
    target,
    text: id,
    name: id,
    ingredient: null,
  }) as unknown as VoiceReviewAction;

describe('groupsOf off the lists', () => {
  const actions = [act('a', 'pantry'), act('b', 'shopping')];

  it('puts the Shopping List first and names no list when the page had none', () => {
    expect(groupsOf(actions, 'none').map((g) => [g.list, g.named])).toEqual([
      ['shopping', false],
      ['pantry', false],
    ]);
  });

  it('still names the other list on a page that has one', () => {
    expect(groupsOf(actions, 'pantry').map((g) => [g.list, g.named])).toEqual([
      ['pantry', false],
      ['shopping', true],
    ]);
  });
});

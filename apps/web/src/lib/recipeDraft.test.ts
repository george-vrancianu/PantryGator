import { describe, expect, it } from 'vitest';
import { problemsOf, type RecipeDraft } from './recipeDraft';

const draft = (steps: { text: string; timer: string }[]): RecipeDraft => ({
  title: 'Soup',
  servings: '2',
  prepMinutes: '',
  cookMinutes: '',
  difficulty: '',
  tagIds: [],
  lines: [],
  steps: steps.map((step, index) => ({ key: index + 1, ...step })),
});

describe('problemsOf', () => {
  it('reports a Step with no text and a bad timer as both problems', () => {
    const problems = problemsOf(draft([{ text: ' ', timer: 'abc' }]));
    expect(problems.steps[1]).toEqual({ text: true, timer: true });
  });

  it('reports one problem when only one is there, and none for a clean Step', () => {
    const problems = problemsOf(
      draft([
        { text: '', timer: '5' },
        { text: 'Boil', timer: 'abc' },
        { text: 'Stir', timer: '' },
      ]),
    );
    expect(problems.steps[1]).toEqual({ text: true, timer: false });
    expect(problems.steps[2]).toEqual({ text: false, timer: true });
    expect(problems.steps[3]).toBeUndefined();
  });
});

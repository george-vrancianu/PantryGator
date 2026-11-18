import { describe, expect, it } from 'vitest';
import { emptyDraft } from '@/lib/recipeDraft';
import { contentOfForm, formOfContent } from '@/lib/recipeDraftContent';
import { documentOf, keysOf, rebasedOnStored } from './familyDraft';

describe('Recipe-level Tips in a Recipe Draft', () => {
  it('survive a save and resume, and are sent as Recipe Tips on create', () => {
    const draft = {
      ...emptyDraft(),
      title: 'Pancakes',
      servings: '4',
      steps: [
        {
          key: 1,
          text: 'Whisk',
          timer: '',
          tips: [{ key: 2, text: 'On the step' }],
        },
      ],
      tips: [{ key: 3, text: 'About the dish' }],
    };
    const content = contentOfForm({ draft, guidance: null });
    expect(content.tips).toEqual([{ text: 'About the dish' }]);
    const back = formOfContent(content).draft;
    expect(back.tips?.map((tip) => tip.text)).toEqual(['About the dish']);
    expect(documentOf(back).tips).toEqual([
      { stepIndex: null, text: 'About the dish' },
      { stepIndex: 0, text: 'On the step' },
    ]);
  });

  it('are absent on a draft saved before they existed', () => {
    const content = contentOfForm({ draft: emptyDraft(), guidance: null });
    expect(content.tips).toBeUndefined();
    expect(documentOf(emptyDraft()).tips).toBeUndefined();
  });
});

describe('rebasedOnStored', () => {
  const row = (key: number, text: string, id?: string) => ({
    key,
    text,
    timer: '',
    ...(id ? { id } : {}),
  });
  const draftOf = (steps: ReturnType<typeof row>[]) => ({
    ...emptyDraft(),
    steps,
  });

  it('gives sent rows the ids the server returned, keeps typed text, and drops ids the server deleted', () => {
    const sent = keysOf(draftOf([row(1, 'A', 's1'), row(2, 'New')]));
    const stored = draftOf([row(10, 'A', 's1'), row(11, 'New', 's9')]);
    // Live: B (id s2, deleted by the Save) came back by Undo; "New" was typed over.
    const live = draftOf([
      row(1, 'A', 's1'),
      row(2, 'New, edited'),
      row(3, 'B', 's2'),
    ]);
    expect(
      rebasedOnStored(live, sent, stored).steps.map((s) => [s.text, s.id]),
    ).toEqual([
      ['A', 's1'],
      ['New, edited', 's9'],
      ['B', undefined],
    ]);
  });
});

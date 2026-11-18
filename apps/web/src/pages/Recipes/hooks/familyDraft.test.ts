import { describe, expect, it } from 'vitest';
import { emptyDraft } from '@/lib/recipeDraft';
import { contentOfForm, formOfContent } from '@/lib/recipeDraftContent';
import { documentOf } from './familyDraft';

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

import { describe, expect, it } from 'vitest';
import { emptyPairing, toGuidanceInput } from './guidanceDraft';
import { emptyDraft } from './recipeDraft';
import { documentOf } from '@/pages/Recipes/hooks/familyDraft';
import { contentOfForm, formOfContent } from './recipeDraftContent';

describe('Suggest Guidance marks in a Recipe Draft', () => {
  it('survive a save and resume, and never reach the Recipe save', () => {
    const guidance = {
      nutritionNote: 'Rich in fibre',
      nutritionNoteSuggested: true,
      pairings: [{ ...emptyPairing(), label: 'Rice', suggested: true }],
      eatingMoments: [
        {
          eatingMomentId: 'm1',
          polarity: 'good_for' as const,
          reason: '',
          suggested: true,
        },
      ],
    };
    const content = contentOfForm({ draft: emptyDraft(), guidance });
    const back = formOfContent(content).guidance!;
    expect(back.nutritionNoteSuggested).toBe(true);
    expect(back.pairings[0]?.suggested).toBe(true);
    expect(back.eatingMoments[0]?.suggested).toBe(true);
    expect(JSON.stringify(toGuidanceInput(back))).not.toContain('suggested');
  });
});

describe('offersBases in a Recipe Draft', () => {
  it('survives a save and resume, and is off by default', () => {
    const on = contentOfForm({
      draft: emptyDraft(),
      guidance: null,
      offersBases: true,
    });
    expect(formOfContent(on).offersBases).toBe(true);
    expect(
      contentOfForm({ draft: emptyDraft(), guidance: null }).offersBases,
    ).toBe(false);
  });
});

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

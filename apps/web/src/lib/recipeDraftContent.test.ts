import { describe, expect, it } from 'vitest';
import { emptyPairing, toGuidanceInput } from './guidanceDraft';
import { emptyDraft } from './recipeDraft';
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

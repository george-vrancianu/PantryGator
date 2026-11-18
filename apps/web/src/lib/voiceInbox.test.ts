import { describe, expect, it } from 'vitest';
import { hasActions, isReady, isSheet, projectState } from './voiceInbox';
import type { VoiceNoteEntry, VoiceNoteStore } from './voiceNoteTypes';

const entry = (patch: Partial<VoiceNoteEntry> = {}): VoiceNoteEntry => ({
  id: 1,
  order: 1,
  phase: 'reading',
  defaultTarget: 'shopping',
  ...patch,
});

const proposal = (transcript: string, ...ids: string[]) => ({
  transcript,
  actions: ids.map((id) => ({ id }) as never),
  answers: [],
});

const store = (patch: Partial<VoiceNoteStore> = {}): VoiceNoteStore => ({
  notes: [],
  lastTarget: 'shopping',
  ...patch,
});

describe('the Voice Inbox projection', () => {
  it('is idle on the last note default list with nothing open', () => {
    const view = projectState(store({ lastTarget: 'pantry' }));
    expect(view).toMatchObject({ phase: 'idle', defaultTarget: 'pantry' });
    expect(view.inbox).toEqual({
      reading: 0,
      ready: 0,
      failed: 0,
      total: 0,
      notes: [],
    });
  });

  it('shows the recording in progress before anything open', () => {
    const view = projectState(
      store({
        live: { defaultTarget: 'pantry', startedAt: 5 },
        notes: [entry({ phase: 'review', proposal: proposal('milk', 'a') })],
        openId: 1,
      }),
    );
    expect(view).toMatchObject({
      phase: 'recording',
      defaultTarget: 'pantry',
      startedAt: 5,
    });
  });

  it('counts the inbox by phase and says which notes have actions', () => {
    const view = projectState(
      store({
        notes: [
          entry({ id: 1 }),
          entry({ id: 2, phase: 'review', proposal: proposal('a', 'x') }),
          entry({ id: 3, phase: 'answers', proposal: proposal('b') }),
          entry({ id: 4, phase: 'failed', error: 'failed' }),
        ],
      }),
    );
    expect(view.inbox).toMatchObject({
      reading: 1,
      ready: 2,
      failed: 1,
      total: 4,
    });
    expect(view.inbox.notes.map((n) => n.hasActions)).toEqual([
      false,
      true,
      false,
      false,
    ]);
  });

  it('merges the notes of a merged Review into one proposal with no default list', () => {
    const view = projectState(
      store({
        notes: [
          entry({ id: 1, phase: 'review', proposal: proposal('one', 'a') }),
          entry({ id: 2, phase: 'review', proposal: proposal('two', 'b') }),
        ],
        merged: [1, 2],
      }),
    );
    expect(view.phase).toBe('review');
    expect(view.defaultTarget).toBe('none');
    expect(view.proposal?.transcript).toBe('one\ntwo');
    expect(view.proposal?.actions.map((a) => a.id)).toEqual(['a', 'b']);
    expect(view.merged?.map((n) => n.id)).toEqual([1, 2]);
  });

  it('is applying only when every merged note is', () => {
    const notes = [
      entry({ id: 1, phase: 'applying', proposal: proposal('one', 'a') }),
      entry({ id: 2, phase: 'review', proposal: proposal('two', 'b') }),
    ];
    expect(projectState(store({ notes, merged: [1, 2] })).phase).toBe('review');
    expect(
      projectState(
        store({
          notes: notes.map((n) => ({ ...n, phase: 'applying' as const })),
          merged: [1, 2],
        }),
      ).phase,
    ).toBe('applying');
  });

  it('flattens the open note without its bookkeeping fields', () => {
    const view = projectState(
      store({
        notes: [entry({ phase: 'review', proposal: proposal('milk', 'a') })],
        openId: 1,
      }),
    );
    expect(view.phase).toBe('review');
    expect(view.proposal?.transcript).toBe('milk');
    expect(view).not.toHaveProperty('id');
    expect(view).not.toHaveProperty('order');
  });
});

describe('Voice Note predicates', () => {
  it('tells ready, actionable and sheet notes apart', () => {
    const answers = entry({ phase: 'answers', proposal: proposal('q') });
    const review = entry({ phase: 'review', proposal: proposal('r', 'a') });
    const applying = entry({ phase: 'applying' });
    expect(isReady(answers) && isReady(review)).toBe(true);
    expect(isReady(applying)).toBe(false);
    expect(hasActions(review)).toBe(true);
    expect(hasActions(answers)).toBe(false);
    expect(isSheet(applying)).toBe(true);
    expect(isSheet(entry())).toBe(false);
    expect(isSheet(undefined)).toBe(false);
  });
});

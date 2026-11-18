import type { VoiceList, VoiceReviewAction } from './voice';
import { hasActions, isReady, isSheet, type Inbox } from './voiceInbox';
import type { MergeOutcome, VoiceNoteEdit } from './voiceNoteTypes';

/** The most Voice Actions one Apply takes (the API's limit); a merged Review over it is refused. */
export const MAX_APPLY_ACTIONS = 50;

/** A Voice Action Apply can send once Review is done with it: not an entry that was not found or understood. */
const canBeApplied = (a: VoiceReviewAction) =>
  a.status !== 'notFound' && a.status !== 'notUnderstood';

/**
 * The Review of the Voice Notes that are ready: opening one note or all of them merged, the Member's
 * edits to the Voice Actions, and how a Review ends (Apply, Done on the answer sheet, discard).
 * Edits land in the note each action came from.
 */
export function createReview(inbox: Inbox) {
  const unmergedListeners = new Set<() => void>();

  /** The Voice Notes the Review on screen is made of: the merged ones, else the open one. */
  const reviewIds = () => {
    const { merged, openId } = inbox.get();
    return merged ?? (openId === undefined ? [] : [openId]);
  };
  /** Changes the Voice Actions of every note in Review. */
  const mapActions = (
    change: (actions: VoiceReviewAction[]) => VoiceReviewAction[],
  ) => {
    const ids = reviewIds();
    if (inbox.phase() !== 'review' || ids.length === 0) return;
    const store = inbox.get();
    inbox.set({
      ...store,
      notes: store.notes.map((n) =>
        ids.includes(n.id) && n.proposal
          ? {
              ...n,
              proposal: { ...n.proposal, actions: change(n.proposal.actions) },
            }
          : n,
      ),
    });
    inbox.emit();
  };
  /** Swaps the chosen list's resolution into each action with a list to pick that `matches`. `byList` stays, so the pick can change. */
  const swapLists = (
    list: VoiceList,
    matches: (action: VoiceReviewAction) => boolean,
  ) =>
    mapActions((actions) =>
      actions.map((a) =>
        a.byList && matches(a) ? { ...a.byList[list], byList: a.byList } : a,
      ),
    );
  /** Moves every note in Review to a phase. */
  const phaseAll = (next: 'review' | 'applying') => {
    const ids = reviewIds();
    const store = inbox.get();
    inbox.set({
      ...store,
      notes: store.notes.map((n) =>
        ids.includes(n.id) ? { ...n, phase: next } : n,
      ),
    });
    inbox.emit();
  };
  /** Closes the Review on screen by taking every note in it out of the list. */
  const removeOpen = () => {
    const ids = reviewIds();
    const store = inbox.get();
    inbox.set({
      ...store,
      notes: store.notes.filter((n) => !ids.includes(n.id)),
      openId: undefined,
      merged: undefined,
    });
    inbox.emit();
  };

  /** Opens one Voice Note that is ready (its Review or answer sheet). Nothing else is open already. */
  function open(id: number) {
    const store = inbox.get();
    if (store.live || store.merged || isSheet(inbox.openNote())) return;
    const next = store.notes.find((n) => n.id === id);
    if (!next || !isReady(next)) return;
    inbox.set({ ...store, openId: next.id });
    inbox.emit();
  }

  return {
    open,
    /** Opens the oldest Voice Note that is ready: its Review, or its answer sheet. Nothing is open already. */
    openReady() {
      const next = inbox.get().notes.find(isReady);
      if (next) open(next.id);
    },

    /**
     * Opens one Review of every Voice Note that is waiting for one ("Review all"), in recording order. Needs
     * two or more and nothing else on screen. Over MAX_APPLY_ACTIONS sendable Voice Actions (not the ones not found or not understood) it is refused.
     */
    openMerged(): MergeOutcome {
      const store = inbox.get();
      if (store.live || store.merged || isSheet(inbox.openNote())) {
        return 'refused';
      }
      const notes = store.notes.filter(hasActions);
      if (notes.length < 2) return 'refused';
      const total = notes.reduce(
        (sum, n) =>
          sum + (n.proposal?.actions.filter(canBeApplied).length ?? 0),
        0,
      );
      if (total > MAX_APPLY_ACTIONS) return 'tooMany';
      inbox.set({ ...store, merged: notes.map((n) => n.id) });
      inbox.emit();
      return 'opened';
    },

    /**
     * Back from a merged Review ("Review all") to the Voice Inbox: nothing is applied or discarded, the notes
     * stay as they are with their edits, and `onUnmerged` listeners (the sheet of notes) are told. Not while Apply is in flight.
     */
    unmerge() {
      const store = inbox.get();
      if (!store.merged || inbox.phase() !== 'review') return;
      inbox.set({ ...store, merged: undefined });
      inbox.emit();
      unmergedListeners.forEach((listener) => listener());
    },
    /** Told when Back left a merged Review. Returns the way to stop listening. */
    onUnmerged(listener: () => void) {
      unmergedListeners.add(listener);
      return () => void unmergedListeners.delete(listener);
    },

    /** Drops a Voice Action. */
    remove(id: string) {
      mapActions((actions) => actions.filter((a) => a.id !== id));
    },
    /** Puts a `needsList` action on a list, swapping in that list's resolution. The pick can change. */
    pickList(id: string, list: VoiceList) {
      swapLists(list, (a) => a.id === id);
    },
    /** Puts every action that has a list to pick on one list. */
    pickAllLists(list: VoiceList) {
      swapLists(list, () => true);
    },
    /** Changes a Voice Action. */
    edit(id: string, patch: VoiceNoteEdit) {
      const { shoppingItem, ...fields } = patch;
      mapActions((actions) =>
        actions.map((a) => {
          if (a.id !== id) return a;
          const next = { ...a, ...fields };
          // The row on the list belongs to the Match it was read for, so a new Match drops it.
          if ('ingredient' in fields || shoppingItem !== undefined) {
            next.rows = { ...a.rows, shoppingItem: shoppingItem ?? undefined };
          }
          return next;
        }),
      );
    },
    /** Apply was sent: Review stays open, its buttons disabled. Only from Review. */
    applying() {
      if (inbox.phase() !== 'review') return;
      phaseAll('applying');
    },
    /** Apply failed: back to Review with every edit kept. */
    applyFailed() {
      if (inbox.phase() !== 'applying') return;
      phaseAll('review');
    },
    /** Closes Review once Apply has succeeded (every merged note leaves with it). */
    applied() {
      if (inbox.phase() !== 'applying') return;
      removeOpen();
    },
    /** Done on the answer sheet: closes it. Nothing was written, so nothing is sent. */
    closeAnswers() {
      if (inbox.phase() !== 'answers') return;
      removeOpen();
    },
    /** Closes Review without applying; ignored while Apply is in flight. */
    discard() {
      if (inbox.phase() !== 'review') return;
      removeOpen();
    },
  };
}

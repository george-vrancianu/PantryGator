import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  useCreateRecipeDraft,
  useUpdateRecipeDraft,
  type RecipeDraftContent,
  type RecipeDraftKind,
} from './recipeDrafts';
import { ApiError } from './api';
import { trackDraftWrite } from './recipeDraftWrites';

/** Quiet time after the last edit before it is sent. */
export const AUTOSAVE_DELAY_MS = 1500;

/** Waits before the 1st, 2nd, ... retry of a failed save; the last one repeats. */
export const AUTOSAVE_RETRY_DELAYS_MS = [3000, 6000, 12_000, 24_000, 30_000];

/**
 * `failed`: the last save failed and is being retried (the header says so).
 * `rejected`: the server refused the write for good (a 4xx that waiting cannot
 * fix, e.g. the Recipe Draft is gone): not retried, and the edits are unsaved.
 * `conflict`: another device or tab saved a newer version; autosave has stopped
 * until the form is reloaded from the server.
 */
export type AutosaveStatus =
  'idle' | 'saving' | 'saved' | 'failed' | 'rejected' | 'conflict';

const isConflict = (caught: unknown) =>
  caught instanceof ApiError &&
  caught.code === 'recipe_drafts.version_conflict';
/** Worth another try: no answer (network), a server fault, or told to slow down. Other 4xx will never succeed. */
const isRetryable = (caught: unknown) =>
  !(caught instanceof ApiError) ||
  caught.status === 0 ||
  caught.status >= 500 ||
  caught.status === 408 ||
  caught.status === 429;
/** The cap does not clear by waiting: only the Member finishing or discarding a Recipe Draft does. */
const isCap = (caught: unknown) =>
  caught instanceof ApiError && caught.code === 'recipe_drafts.limit_reached';

export type AutosaveOptions = {
  /** What the Recipe Draft is for, and (for a Variant) its base. Fixed once it exists. */
  kind: RecipeDraftKind;
  baseRecipeId: string | null;
  /** The form as it is now, in the API's content shape (`contentOfForm`). */
  content: RecipeDraftContent;
  /**
   * The content of the untouched form: no Recipe Draft exists until `content`
   * differs from it. Null when the form starts with something to keep (a
   * supplied fill), which then creates one on its first save.
   */
  blank: RecipeDraftContent | null;
  /** False keeps the form out of autosave (the default is on). */
  enabled?: boolean;
  /** A Recipe Draft being resumed: the form already holds its content. */
  resumed?: { id: string; version: number };
};

export type Autosave = {
  status: AutosaveStatus;
  /** The last write's error, until a write succeeds again (the cap `recipe_drafts.limit_reached` shows from it). */
  error: unknown;
  /** True while the last save failed or lost to a newer version, so leaving would lose edits. Read when needed (it is current even before a re-render). */
  hasUnsaved: () => boolean;
  /** True once a write lost to a newer version, until the form is reloaded. Read when needed (current even before a re-render): the stored Recipe Draft is then not this form's to end or discard. */
  conflicted: () => boolean;
  /** The Recipe Draft's id once it exists. */
  draftId: string | null;
  /** Sends what is pending now (after a request in flight); resolves to the Recipe Draft id, or null if there is none. Never rejects. */
  flush: () => Promise<string | null>;
  /** The stored Recipe Draft is gone (a 404): create a new one from the form as it is, and carry on saving to that. */
  keepAsNew: () => void;
  /** The Recipe is being created: send nothing until `resume` (a Recipe Draft being consumed must not be updated). */
  pause: () => void;
  /** The create failed: carry on, sending whatever changed meanwhile. */
  resume: () => void;
  /** The Recipe was saved and ended the Recipe Draft: send nothing more. */
  stop: () => void;
};

/**
 * Keeps the form as a Recipe Draft on the server (ADR 0028): created on the
 * first real content, then updated `AUTOSAVE_DELAY_MS` after the last edit,
 * one request at a time (edits made meanwhile go out together afterwards),
 * and flushed when the form unmounts and on `pagehide` or the page turning hidden (those with `keepalive`: the browser caps such a body at 64 KB, and an edit queued behind a request in flight is lost at unload).
 */
export function useRecipeDraftAutosave(options: AutosaveOptions): Autosave {
  const create = useCreateRecipeDraft();
  const update = useUpdateRecipeDraft();
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [error, setError] = useState<unknown>(null);
  const [draftId, setDraftId] = useState<string | null>(
    options.resumed?.id ?? null,
  );
  const json = JSON.stringify(options.content);
  const latest = useRef(options);
  const writes = useRef({
    create: create.mutateAsync,
    update: update.mutateAsync,
  });
  // Before any other effect of this render reads them.
  useLayoutEffect(() => {
    latest.current = options;
    writes.current = { create: create.mutateAsync, update: update.mutateAsync };
  });

  const run = useRef({
    id: options.resumed?.id ?? null,
    version: options.resumed?.version ?? 0,
    // The JSON last known to be on the server; a resumed form starts equal to it.
    sent: options.resumed ? json : (null as string | null),
    busy: null as Promise<void> | null,
    again: false,
    timer: null as ReturnType<typeof setTimeout> | null,
    stopped: false,
    paused: false,
    /** The last write failed and the edits are not on the server. */
    failed: false,
    failures: 0,
    conflict: false,
    keepalive: false,
    disposed: false,
  });

  const isUnchanged = (current: string) => {
    const state = run.current;
    if (latest.current.enabled === false) return true;
    if (current === state.sent) return true;
    const blank = latest.current.blank;
    return (
      state.id === null && blank !== null && current === JSON.stringify(blank)
    );
  };

  const drain = useCallback(function drain(
    keepalive = false,
    force = false,
  ): Promise<void> {
    const state = run.current;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    // `force` (the form closing) sends even while paused: nothing may be lost, and a Recipe Draft already consumed just refuses.
    if (state.stopped || state.conflict || (state.paused && !force))
      return Promise.resolve();
    if (keepalive) state.keepalive = true;
    if (state.busy) {
      // Something is in flight: send the newest right after it.
      state.again = true;
      return state.busy;
    }
    const send = async () => {
      try {
        do {
          state.again = false;
          const { content, kind, baseRecipeId } = latest.current;
          const sending = JSON.stringify(content);
          if (state.stopped || isUnchanged(sending)) break;
          // A failed save keeps saying so while it is retried.
          if (!state.failed) setStatus('saving');
          const { keepalive } = state;
          if (state.id === null) {
            const made = await writes.current.create({
              kind,
              baseRecipeId,
              content,
              keepalive,
            });
            state.id = made.id;
            state.version = made.version;
            setDraftId(made.id);
          } else {
            const saved = await writes.current.update({
              id: state.id,
              version: state.version,
              content,
              keepalive,
            });
            state.version = saved.version;
          }
          state.sent = sending;
          state.failed = false;
          state.failures = 0;
          setError(null);
          // Edits made during the request (`again`) go out right after it, not a quiet period later.
        } while (state.again);
        if (!state.stopped) {
          const settled = isUnchanged(JSON.stringify(latest.current.content));
          setStatus(settled ? 'saved' : 'saving');
        }
      } catch (caught) {
        setError(caught);
        if (state.stopped) return;
        state.failed = true;
        if (isConflict(caught)) {
          state.conflict = true;
          setStatus('conflict');
        } else if (isCap(caught)) {
          setStatus('idle');
        } else if (!isRetryable(caught)) {
          setStatus('rejected');
        } else {
          setStatus('failed');
          // Retry, a little later each time. A closed form does not retry (its one last try was this).
          const wait =
            AUTOSAVE_RETRY_DELAYS_MS[
              Math.min(state.failures, AUTOSAVE_RETRY_DELAYS_MS.length - 1)
            ];
          state.failures += 1;
          if (!state.disposed && !state.paused) {
            state.timer = setTimeout(() => {
              state.timer = null;
              void drain();
            }, wait);
          }
        }
      }
    };
    // Cleared after the assignment, even when `send` finishes without waiting.
    state.busy = send().finally(() => {
      state.busy = null;
      // Asked only for the round sent as the page hid: a page restored from the back/forward cache carries on normally.
      state.keepalive = false;
    });
    return state.busy;
  }, []);

  // Each edit restarts the quiet period.
  const schedule = useCallback(() => {
    const state = run.current;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    if (state.stopped || state.paused || state.conflict) return;
    if (isUnchanged(JSON.stringify(latest.current.content))) {
      // Back to what the server holds (or to blank): nothing is pending any more.
      if (!state.busy) {
        if (state.failed) {
          state.failed = false;
          state.failures = 0;
          setError(null);
          setStatus(state.id ? 'saved' : 'idle');
        } else {
          setStatus((now) =>
            now === 'saving' ? (state.id ? 'saved' : 'idle') : now,
          );
        }
      }
      return;
    }
    if (!state.failed) setStatus('saving');
    state.timer = setTimeout(() => {
      state.timer = null;
      void drain();
    }, AUTOSAVE_DELAY_MS);
  }, [drain]);
  useEffect(schedule, [json, schedule]);

  // Leaving the form sends what is pending; so does the page going away, which must outlive it.
  useEffect(() => {
    const onHide = () => void drain(true);
    const state = run.current;
    state.disposed = false;
    // Mobile browsers often skip `pagehide` (the app is swiped away from the background), but always fire `visibilitychange` first.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      state.disposed = true;
      // Tracked, so a Recipe Draft read right after waits for this last write. Forced: also while paused.
      trackDraftWrite(drain(false, true));
    };
  }, [drain]);

  const flush = useCallback(async () => {
    await drain();
    return run.current.id;
  }, [drain]);

  const hasUnsaved = useCallback(() => {
    const state = run.current;
    return !state.stopped && state.failed;
  }, []);

  const conflicted = useCallback(() => run.current.conflict, []);

  const stop = useCallback(() => {
    const state = run.current;
    state.stopped = true;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
  }, []);

  const pause = useCallback(() => {
    const state = run.current;
    state.paused = true;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
  }, []);

  const keepAsNew = useCallback(() => {
    const state = run.current;
    if (state.stopped || state.busy) return;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    state.id = null;
    state.version = 0;
    state.sent = null;
    state.failed = false;
    state.failures = 0;
    setDraftId(null);
    setError(null);
    if (isUnchanged(JSON.stringify(latest.current.content))) {
      setStatus('idle');
      return;
    }
    setStatus('saving');
    void drain();
  }, [drain]);

  const resume = useCallback(() => {
    run.current.paused = false;
    schedule();
  }, [schedule]);

  return {
    status,
    error,
    draftId,
    hasUnsaved,
    conflicted,
    flush,
    pause,
    keepAsNew,
    resume,
    stop,
  };
}

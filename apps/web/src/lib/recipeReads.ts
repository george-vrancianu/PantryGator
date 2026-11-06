import { useEffect, useSyncExternalStore } from 'react';
import { nextBackgroundOrder } from '../components/background/backgroundItem';
import { ApiError, isNetworkError } from './api';
import { isOutOfCredits } from './credits';
import {
  readRecipeLink,
  type ReadingLanguage,
  type RecipeFromLink,
} from './linkRecipe';
import { writePlateRecipe } from './plate';

/** At most this many recipe reads run at once; the rest wait in the order they were started. */
export const MAX_RECIPE_READS = 2;
/** At most this many recipe reads are held (waiting, reading, ready or failed) until the Member reviews some. */
export const MAX_HELD_RECIPE_READS = 5;

/** A read that fails for want of a network is tried once more after this long, before it shows failed. */
export const RECIPE_READ_AUTO_RETRY_MS = 1500;

/**
 * `waiting` for a free slot, `reading`, `ready` (a Recipe Draft is kept), `failed`, or `capped` (the Link Cap or Credits refused it, or it was waiting behind the read that was
 * refused; Retry tries again, like a capped Scan in ADR 0004).
 */
export type RecipeReadStatus =
  'waiting' | 'reading' | 'ready' | 'failed' | 'capped';

/** What a Member asked to read: a link or pasted text, never both. */
export type LinkReadSource =
  { kind: 'link'; url: string } | { kind: 'text'; text: string };

/**
 * What every kind of recipe read holds. A kind adds its own request fields (`LinkRecipeRead` below) and
 * its reader in `startRead`; the holder's limits, queue, retry and discard never look past this.
 */
type RecipeReadBase = {
  /** Ascends with the order the reads were started. */
  id: number;
  /** `nextBackgroundOrder` when started: orders its row against other kinds of background item. */
  order: number;
  status: RecipeReadStatus;
  /** When ready: the Recipe Draft the server kept. */
  recipeDraftId?: string;
  /** When failed or capped: why (an `ApiError` for the Link Cap carries its `cap` and `resetsAt`). */
  error?: unknown;
};

/** A Recipe from Link read: a link or pasted text. */
export type LinkRecipeRead = RecipeReadBase & {
  kind: 'link';
  source: LinkReadSource;
  language: ReadingLanguage;
  /** The page's site (`example.com`) for a link; null for pasted text. */
  site: string | null;
};

/** A Plate Scan dish being written as a Recipe (ADR 0035): the picked guess and the token that proves the Scan guessed it. */
export type PlateRecipeRead = RecipeReadBase & {
  kind: 'plate';
  /** The dish the Member picked. */
  title: string;
  /** The Plate token of the Scan; the request spends it. */
  token: string;
  /**
   * The refusal codes (`ApiError.code`) the server answers with that send the read back to where it
   * came from instead of into the strip: the holder drops the read and calls `onReturned` with the error.
   * The refused pick stays on the Plate card (ADR 0035). Waiting reads behind a Credits refusal are still held.
   */
  returnOn?: readonly string[];
  /** Called once the read is dropped for a code in `returnOn`; puts the card back with the refusal. */
  onReturned?: (error: ApiError) => void;
  /**
   * Called when the Member chooses "read the photo again" on a failed row whose token is used up or has
   * expired: puts the Scan back to be read again. The row is let go by the caller.
   */
  readAgain?: () => void;
};

/** A read in the holder. A new kind joins this union (see `startRead`). */
export type RecipeRead = LinkRecipeRead | PlateRecipeRead;
export type RecipeReadKind = RecipeRead['kind'];

/** The Recipe from Link reads among `reads`. */
export const linkReadsOf = (reads: RecipeRead[]): LinkRecipeRead[] =>
  reads.filter((r): r is LinkRecipeRead => r.kind === 'link');

/** A read as a caller hands it over: the holder gives it its id, order and status. */
export type NewRecipeRead = DistributiveOmit<RecipeRead, keyof RecipeReadBase>;
type DistributiveOmit<T, K extends keyof never> = T extends unknown
  ? Omit<T, K>
  : never;

/** What a kind's request answered: the Recipe Draft it kept, or (link only) that the link is already a Recipe. */
type RecipeReadResult = { recipeDraftId: string } | { duplicate: true };

/**
 * The one place a kind brings its request: sends it and says what came back. `force` is the Member's
 * "Read again" choice (link only). Throws what the request throws (an `ApiError`); an aborted
 * `signal` abandons it.
 */
function startRead(
  read: RecipeRead,
  options: { signal: AbortSignal; force: boolean },
): Promise<RecipeReadResult> {
  switch (read.kind) {
    case 'link':
      return readRecipeLink({
        ...(read.source.kind === 'link'
          ? {
              url: read.source.url,
              ...(options.force ? { force: true } : {}),
            }
          : { text: read.source.text }),
        language: read.language,
        signal: options.signal,
      }).then((result: RecipeFromLink) =>
        result.kind === 'duplicate'
          ? { duplicate: true }
          : { recipeDraftId: result.recipeDraftId },
      );
    case 'plate':
      return writePlateRecipe({
        dishTitle: read.title,
        plateToken: read.token,
        signal: options.signal,
      });
  }
}

export type RecipeReadsState = { reads: RecipeRead[] };

/** `full`: the holder is at its limit; the Member must review some first. */
export type SubmitOutcome = 'started' | 'full';

/** The site of a link, as the Member would say it: the host without `www.`. */
export function siteOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** The API answered that the Link Cap is reached. */
export const isCapReached = (error: unknown) =>
  error instanceof ApiError && error.code === 'link.cap_reached';

/** A refusal that holds every read from here: the Link Cap, or the Family being out of Credits. */
const isBudgetRefusal = (error: unknown) =>
  isCapReached(error) || isOutOfCredits(error);

/**
 * The recipe-read holder: the Member's reads that keep a Recipe Draft (a link, pasted text or a Plate Scan dish), kept in memory outside any page, like the Voice Inbox.
 * It reads with plain API requests, not a page's mutation or the query cache, so a read outlives the
 * sheet that started it and every page change. At most `MAX_RECIPE_READS` run; the rest wait in the
 * order started. Sign-out clears it, dropping every read silently.
 */
export function createRecipeReads() {
  let state: RecipeReadsState = { reads: [] };
  let nextId = 1;
  const listeners = new Set<() => void>();
  const finishedListeners = new Set<() => void>();
  const settledListeners = new Set<() => void>();
  /** One per running read: aborting it abandons that request, and only it. */
  const controllers = new Map<number, AbortController>();
  /** Reads to send with `force` (the Member chose "Read again"). */
  const forced = new Set<number>();
  /** Reads already tried again after a network error: one automatic retry each. */
  const retried = new Set<number>();
  /** How many failed or capped reads the strip has announced as an alert. Outlives the strip, which remounts. */
  let announcedFailed = 0;
  /** The pending automatic retry of a read: it keeps its slot meanwhile. */
  const retryTimers = new Map<number, ReturnType<typeof setTimeout>>();

  const set = (reads: RecipeRead[]) => {
    state = { reads };
    listeners.forEach((listener) => listener());
  };
  const patch = (id: number, changes: Partial<RecipeReadBase>) =>
    set(state.reads.map((r) => (r.id === id ? { ...r, ...changes } : r)));
  const find = (id: number) => state.reads.find((r) => r.id === id);

  /** Starts waiting reads while there is a free slot. */
  function pump() {
    for (;;) {
      const running = state.reads.filter((r) => r.status === 'reading').length;
      if (running >= MAX_RECIPE_READS) return;
      // Oldest first by order: a read started again goes behind the ones already waiting.
      const next = state.reads
        .filter((r) => r.status === 'waiting')
        .sort((a, b) => a.order - b.order)[0];
      if (!next) return;
      run(next);
    }
  }

  function run(read: RecipeRead) {
    const attempt = new AbortController();
    controllers.set(read.id, attempt);
    patch(read.id, { status: 'reading', error: undefined });
    const force = forced.delete(read.id);
    startRead(read, { signal: attempt.signal, force }).then(
      (result) => {
        // A discarded (aborted) read never reports.
        if (attempt.signal.aborted || controllers.get(read.id) !== attempt)
          return;
        controllers.delete(read.id);
        if ('duplicate' in result) {
          // The sheet asked first and the link was not a Recipe then; one was saved since. The Member asked
          // for this read, so read it anyway rather than leave a row with nothing to review.
          forced.add(read.id);
          patch(read.id, { status: 'waiting', order: nextBackgroundOrder() });
          pump();
          return;
        }
        patch(read.id, {
          status: 'ready',
          recipeDraftId: result.recipeDraftId,
        });
        finishedListeners.forEach((listener) => listener());
        settledListeners.forEach((listener) => listener());
        pump();
      },
      (error: unknown) => {
        if (attempt.signal.aborted || controllers.get(read.id) !== attempt)
          return;
        controllers.delete(read.id);
        if (isNetworkError(error) && !retried.has(read.id)) {
          // No answer at all: once more before the Member sees a failure. The read stays "reading".
          retried.add(read.id);
          if (force) forced.add(read.id);
          retryTimers.set(
            read.id,
            setTimeout(() => {
              retryTimers.delete(read.id);
              const again = find(read.id);
              if (again) run(again);
            }, RECIPE_READ_AUTO_RETRY_MS),
          );
          return;
        }
        // A plate read goes back to its card, never to the strip, for a code it is returned on.
        const returnsTo = (r: RecipeRead): r is PlateRecipeRead =>
          r.kind === 'plate' &&
          error instanceof ApiError &&
          !!r.returnOn?.includes(error.code);
        if (returnsTo(read)) {
          // Not a row: the Member picks again from where the read came from. Only the Credits hold the
          // reads waiting behind it (a plate read waiting among them is returned too).
          const returned = state.reads.filter(
            (r) =>
              r.id === read.id ||
              (isOutOfCredits(error) && r.status === 'waiting' && returnsTo(r)),
          ) as PlateRecipeRead[];
          set(
            state.reads
              .filter((r) => !returned.includes(r as PlateRecipeRead))
              .map((r) =>
                isOutOfCredits(error) && r.status === 'waiting'
                  ? { ...r, status: 'capped', error }
                  : r,
              ),
          );
          for (const r of returned) r.onReturned?.(error as ApiError);
        } else if (isBudgetRefusal(error)) {
          // The Credits refuse every read from here; a kind's own cap (the Link Cap) refuses only that
          // kind. Those waiting behind the refusal are held with it, except a plate read that is
          // returned to its card on this code.
          const holds = (r: RecipeRead) =>
            isOutOfCredits(error) || r.kind === read.kind;
          const returned = state.reads.filter(
            (r) => r.status === 'waiting' && holds(r) && returnsTo(r),
          ) as PlateRecipeRead[];
          set(
            state.reads
              .filter((r) => !returned.includes(r as PlateRecipeRead))
              .map((r) =>
                r.id === read.id || (r.status === 'waiting' && holds(r))
                  ? { ...r, status: 'capped', error }
                  : r,
              ),
          );
          for (const r of returned) r.onReturned?.(error as ApiError);
        } else {
          patch(read.id, { status: 'failed', error });
        }
        settledListeners.forEach((listener) => listener());
        pump();
      },
    );
  }

  /** Lets a read go: aborts its request if it is running, and only that one. Frees its slot. */
  function discard(id: number) {
    if (!find(id)) return;
    controllers.get(id)?.abort();
    controllers.delete(id);
    forced.delete(id);
    retried.delete(id);
    clearTimeout(retryTimers.get(id));
    retryTimers.delete(id);
    set(state.reads.filter((r) => r.id !== id));
    pump();
  }

  /**
   * Holds a read of any kind and starts it as soon as a slot is free. `full`: five are held already;
   * nothing was added. `force`: the link is already one of the Recipes and the Member chose "Read
   * again". `replaces`: a failed read this one stands in for ("Paste text instead" on a page that
   * could not be read); it is let go first, so it never fills the last place.
   */
  function add(
    read: NewRecipeRead,
    options: { force?: boolean; replaces?: number } = {},
  ): SubmitOutcome {
    if (
      options.replaces !== undefined &&
      find(options.replaces)?.status === 'failed'
    ) {
      discard(options.replaces);
    }
    if (state.reads.length >= MAX_HELD_RECIPE_READS) return 'full';
    const id = nextId++;
    if (options.force) forced.add(id);
    set([
      ...state.reads,
      { ...read, id, order: nextBackgroundOrder(), status: 'waiting' },
    ]);
    pump();
    return 'started';
  }

  return {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Told when a read settles, kept or failed (a kept read costs Credits). */
    onReadSettled: (listener: () => void) => {
      settledListeners.add(listener);
      return () => {
        settledListeners.delete(listener);
      };
    },
    /** Told when a read keeps a Recipe Draft (the Recipe Drafts list is out of date). */
    onDraftKept: (listener: () => void) => {
      finishedListeners.add(listener);
      return () => {
        finishedListeners.delete(listener);
      };
    },
    add,
    /** Holds a Recipe from Link read (a link or pasted text): `add` for the link kind. */
    submit(
      source: LinkReadSource,
      language: ReadingLanguage,
      options: { force?: boolean; replaces?: number } = {},
    ): SubmitOutcome {
      return add(
        {
          kind: 'link',
          source,
          language,
          site: source.kind === 'link' ? siteOf(source.url) : null,
        },
        options,
      );
    },
    /**
     * Tries a failed or capped read again. Retrying a capped read releases every read the cap held
     * (ADR 0004); each goes back to waiting in its place, and the Link Cap and the Credits decide again.
     */
    retry(id: number) {
      const read = find(id);
      if (!read || (read.status !== 'failed' && read.status !== 'capped'))
        return;
      const releasing = (r: RecipeRead) =>
        r.id === id || (read.status === 'capped' && r.status === 'capped');
      retried.delete(id);
      set(
        state.reads.map((r) =>
          releasing(r) ? { ...r, status: 'waiting', error: undefined } : r,
        ),
      );
      pump();
    },
    discard,
    announcedFailed: () => announcedFailed,
    announceFailed(failed: number) {
      announcedFailed = failed;
    },
    /** Drops every read silently (sign-out). */
    clear() {
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
      forced.clear();
      retried.clear();
      retryTimers.forEach((timer) => clearTimeout(timer));
      retryTimers.clear();
      announcedFailed = 0;
      set([]);
    },
  };
}

export type RecipeReads = ReturnType<typeof createRecipeReads>;

/** The app's one recipe-read holder. */
export const recipeReads = createRecipeReads();

/**
 * While a recipe read is waiting or reading, asks before the page unloads (closing the tab, reloading):
 * the read lasts as long as its page and would be lost. Ready and failed reads need no prompt.
 * Mounted once, by the app layout.
 */
export function useUnloadPromptWhileReading() {
  // Subscribes to the holder directly, so the layout never re-renders on a status change.
  useEffect(() => {
    const ask = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers need a return value to show the prompt.
      event.returnValue = '';
    };
    let asking = false;
    const sync = () => {
      const want = recipeReads
        .getState()
        .reads.some((r) => r.status === 'waiting' || r.status === 'reading');
      if (want === asking) return;
      asking = want;
      if (want) window.addEventListener('beforeunload', ask);
      else window.removeEventListener('beforeunload', ask);
    };
    sync();
    const unsubscribe = recipeReads.subscribe(sync);
    return () => {
      unsubscribe();
      window.removeEventListener('beforeunload', ask);
    };
  }, []);
}

export const useRecipeReads = (): RecipeReadsState =>
  useSyncExternalStore(
    recipeReads.subscribe,
    recipeReads.getState,
    recipeReads.getState,
  );

import { useCallback, useEffect, useRef, useState } from 'react';

/** The lists whose rows swipe and hold: each has its own first-use hint and removal context. */
export type RowList =
  | 'pantry'
  | 'shopping'
  | 'template'
  | 'staples'
  | 'familyCatalog'
  | 'adminQueue';

/** The hint shows this long after the list has rows to show it on. */
const SHOW_AFTER_MS = 700;
/** How long `peek` stays on: longer than the row's own peek, so it plays whenever the row is mounted. */
const PEEK_WINDOW_MS = 1200;

const keyOf = (list: RowList) => `pp.rowHint.${list}`;

function wasShown(list: RowList): boolean {
  try {
    return window.localStorage.getItem(keyOf(list)) !== null;
  } catch {
    // Storage can be blocked: the hint then shows on every visit, which is harmless.
    return false;
  }
}

function remember(list: RowList): void {
  try {
    window.localStorage.setItem(keyOf(list), '1');
  } catch {
    // Not persisting is acceptable.
  }
}

export type RowHint = {
  /** Render the pill, invisible, to keep its space: the list has rows and has not shown the hint yet. */
  reserve: boolean;
  /** The pill is showing; false again once the Member has used a gesture (it fades, keeping its space). */
  visible: boolean;
  /** True for a moment when the hint appears: give it to the list's first row as `SwipeRow peek`. */
  peek: boolean;
  /** Give it to every row of the list as `SwipeRow onLearned`. */
  onLearned: () => void;
};

/**
 * The first-use hint of a gesture list (handoff section 7), shown once per list and remembered locally.
 * `active` says the list has a row to show it on (not for an empty list; for the Pantry, once a roll-up is
 * expanded). 700 ms after that, the pill shows and the first row peeks; a swipe to zone 1 or a completed
 * hold on any row of the list (`onLearned`) fades the pill.
 */
export function useRowHint(list: RowList, active: boolean): RowHint {
  // Read once: a hint shown during this visit keeps its space for the whole visit.
  const [unseen] = useState(() => !wasShown(list));
  const [shown, setShown] = useState(false);
  const [learned, setLearned] = useState(false);
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!active || shown || learned || wasShown(list)) return;
    const timer = setTimeout(() => {
      remember(list);
      setShown(true);
      setPeek(true);
      clearTimeout(peekTimer.current);
      peekTimer.current = setTimeout(() => setPeek(false), PEEK_WINDOW_MS);
    }, SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [active, shown, learned, list]);

  useEffect(() => () => clearTimeout(peekTimer.current), []);

  const onLearned = useCallback(() => {
    // A gesture used before the hint showed makes it pointless for good.
    remember(list);
    setLearned(true);
    setPeek(false);
  }, [list]);

  return {
    // A gesture that skips the hint before it shows leaves nothing to reserve space for.
    reserve: unseen && (shown || (active && !learned)),
    visible: shown && !learned,
    peek,
    onLearned,
  };
}

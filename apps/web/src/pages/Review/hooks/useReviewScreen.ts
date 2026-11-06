import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useBreakpointUp } from '@pocket-pantry/ui';
import { translateApiError } from '../../../i18n/translateApiError';
import {
  useCatalogParents,
  type CatalogSearchResult,
} from '../../../lib/catalog';
import {
  displayName,
  statusOf,
  invalidFields,
  type ReviewField,
  reviewLinesOf,
  type ReviewLine,
  matchSearchInputs,
} from '../../../lib/review';
import { firstFocusField } from '../../../lib/reviewFocus';
import {
  initReviewState,
  reviewCounts,
  reviewGroups,
  reviewReducer,
} from '../../../lib/reviewState';
import {
  dispatchScanSession,
  getScanSession,
  photoBarcodeOf,
  useScanSession,
} from '../../../lib/scanSession';
import { useSaveLines } from '../../../lib/saveScan';
import type { TickFailures } from '../../../lib/receiptScan';
import { MAX_BULK_BATCHES } from '../../../lib/scan';
import {
  unverifiedState,
  type UnverifiedState,
} from '../../../lib/unverifiedState';
import {
  EXCLUDED_TOGGLE_ID,
  fieldId,
  rowId,
  sheetTitleId,
} from '../components/layout';

/**
 * Review screen state for one card of the Scan Session. The Member's edits live here, and are
 * written back to the card as they are made, so leaving the editor keeps them. Saving goes
 * through `saveLines`, which routes by the card's Scan Mode.
 */
/** The sheet has no Name input: an Unmatched line's name is typed in the chooser. */
const sheetFieldId = (line: ReviewLine, field: ReviewField | 'match') =>
  fieldId(line.key, !line.match && field === 'name' ? 'match' : field);

export function useReviewScreen(
  /**
   * The host's settings: when the card is saved the host takes over (the Intro counts the Batches and
   * returns to its overview) instead of landing on the Pantry. A Receipt's unticked Shopping Items are not told: a new
   * Member has none.
   */
  host?: { onSaved: (saved: number) => void },
) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // A card of the Scan Session is edited at /scan/review/:scanId.
  const { scanId = '' } = useParams();
  // Read once: saving removes the card, which must not bounce the page back to the overview.
  const [draft] = useState(() => {
    const scan = getScanSession().scans.find((s) => s.id === scanId);
    return scan?.lines
      ? {
          mode: scan.mode,
          lines: reviewLinesOf(scan),
          scanLanguage: scan.scanLanguage,
        }
      : null;
  });
  // Saving or discarding a card drops it from the Scan Session; the other cards are still to do.
  const leaveCard = (fallback: string) => {
    dispatchScanSession({ type: 'remove', id: scanId });
    return getScanSession().scans.length > 0 ? '/scan/review' : fallback;
  };
  // The phone (and the host's Setup Review) edits one line at a time in a sheet; the tablet edits inline.
  const wide = useBreakpointUp('md');
  const phone = host !== undefined || !wide;
  const [state, dispatch] = useReducer(
    reviewReducer,
    draft?.lines ?? [],
    (lines: ReviewLine[]) => initReviewState(lines, !phone),
  );
  // Every change goes back to the card, so Add all saves what the Member sees.
  const initialLines = useRef(state.lines);
  useEffect(() => {
    if (state.lines !== initialLines.current)
      dispatchScanSession({ type: 'edit', id: scanId, lines: state.lines });
  }, [scanId, state.lines]);
  // A Product Scan's photo barcode can settle while the editor is open: its single line takes it too.
  const photoBarcode = photoBarcodeOf(useScanSession(), scanId);
  const lineCount = state.lines.length;
  const firstKey = state.lines[0]?.key;
  const firstBarcode = state.lines[0]?.barcode;
  useEffect(() => {
    if (photoBarcode && lineCount === 1 && firstBarcode === undefined)
      dispatch({ type: 'attachBarcode', key: firstKey, barcode: photoBarcode });
  }, [photoBarcode, lineCount, firstKey, firstBarcode]);
  const saver = useSaveLines();
  const mode = draft?.mode ?? 'product';
  // Excluded lines (Scan-excluded or removed by the Member) wait outside the list and are never saved.
  const groups = reviewGroups(state);
  const counts = reviewCounts(state);
  const included = state.lines.filter((line) => line.excluded === null);
  const parents = useCatalogParents(
    included.some((line) => line.match === null),
  );
  // Receipt Scan: ticking Shopping Items happens after the save; if any tick failed, say so here before leaving.
  const [tickFailures, setTickFailures] = useState<TickFailures | null>(null);
  // Saved lines the Member never verified, told on the page Save lands on.
  const [savedState, setSavedState] = useState<{
    landing: string;
    state: UnverifiedState | undefined;
  }>();
  // Focus lands on an element that only exists after the render that opened or restored it.
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (focusId === null) return;
    document.getElementById(focusId)?.focus();
    // oxlint-disable-next-line react/set-state-in-effect -- one-shot focus request: consumed (cleared) once the element is focused
    setFocusId(null);
  }, [focusId, state]);
  const overLimit = Math.max(0, included.length - MAX_BULK_BATCHES);

  const change = (key: string, patch: Partial<ReviewLine>) =>
    dispatch({ type: 'update', key, patch });
  // The line whose Match is being swapped in the one page-level dialog. The key
  // outlives the dialog so its title does not change while it fades out.
  const [swapKey, setSwapKey] = useState<string | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const swapOpener = useRef<HTMLElement | null>(null);
  const [restoreOpener, setRestoreOpener] = useState(false);
  const swapLine = state.lines.find((l) => l.key === swapKey) ?? null;
  const swapInputs = swapLine ? matchSearchInputs(swapLine) : null;
  const openSwap = (key: string) => {
    // Safari and macOS Firefox do not focus a clicked button: then there is no opener to return to.
    const el = document.activeElement;
    swapOpener.current =
      el instanceof HTMLElement && el !== document.body ? el : null;
    setSwapKey(key);
    setSwapOpen(true);
  };
  const closeSwap = () => {
    setSwapOpen(false);
    setRestoreOpener(true);
  };
  // After the render that closed the dialog: back to the opener, or to the row if a regroup replaced it.
  useEffect(() => {
    if (!restoreOpener) return;
    // oxlint-disable-next-line react/set-state-in-effect -- one-shot focus request: consumed (cleared) once focus is handed back
    setRestoreOpener(false);
    const opener = swapOpener.current;
    if (opener?.isConnected) opener.focus();
    else if (swapKey) document.getElementById(rowId(swapKey))?.focus();
  }, [restoreOpener, swapKey]);
  const changeMatch = (match: CatalogSearchResult) => {
    if (swapKey === null) return;
    dispatch({ type: 'changeMatch', key: swapKey, match, today: new Date() });
    closeSwap();
  };
  // The phone sheet's inline chooser: the same change as the dialog's pick, without a dialog to close.
  const pickMatch = (key: string, match: CatalogSearchResult) =>
    dispatch({ type: 'changeMatch', key, match, today: new Date() });
  // Opening a row by hand puts focus on its first empty field (else Match); shutting it returns to its button.
  // Rows open on load never come through here, so they do not steal focus.
  // The tablet has no Match field to open on, so it names the input to land on instead.
  const toggle = (key: string, instead?: ReviewField) => {
    const line = state.lines.find((l) => l.key === key);
    dispatch({ type: 'toggle', key });
    if (!line) return;
    const field = firstFocusField(line);
    setFocusId(
      state.open[key]
        ? rowId(key)
        : fieldId(key, field === 'match' ? (instead ?? 'match') : field),
    );
  };
  const open = (key: string) => dispatch({ type: 'open', key });
  // The phone's sheet: one line open at a time. The key outlives the sheet so its content does not change while it fades out.
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const sheetOpen = phone && sheetKey !== null && !!state.open[sheetKey];
  // Where focus goes once the sheet has finished closing (the dialog hands focus back to its opener first).
  const exitFocus = useRef<string | null>(null);
  // Where focus goes once the sheet has finished opening (the dialog takes focus itself while it opens).
  const enterFocus = useRef<string | null>(null);
  // The sheet is opening because Save or Confirm was blocked: its invalid field is scrolled into view.
  const blockedEntry = useRef(false);
  const openSheet = (key: string) => {
    const line = state.lines.find((l) => l.key === key);
    if (!line) return;
    setSheetKey(key);
    dispatch({ type: 'openOnly', key });
    // A blocked-Save sheet closed before it finished opening must not make this open scroll.
    blockedEntry.current = false;
    const field = firstFocusField(line);
    // A matched line with nothing to fix has no field to land on: the title, not the chooser.
    enterFocus.current =
      field === 'match' && line.match
        ? sheetTitleId(key)
        : sheetFieldId(line, field);
  };
  // The Sheet focuses this once it has opened (a text field stays unfocused on a phone, ADR 0039).
  const sheetInitialFocus = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        const id = enterFocus.current;
        return id ? document.getElementById(id) : null;
      },
    }),
    [],
  );
  const sheetEntered = () => {
    // A field that blocks Save is shown, not focused, on a phone (a text field keeps the keyboard down, ADR 0039).
    const id = enterFocus.current;
    if (id && blockedEntry.current)
      document.getElementById(id)?.scrollIntoView?.({ block: 'center' });
    blockedEntry.current = false;
    enterFocus.current = null;
  };
  const closeSheet = () => {
    if (sheetKey === null) return;
    exitFocus.current = rowId(sheetKey);
    dispatch({ type: 'close', key: sheetKey });
  };
  const sheetExited = () => {
    const id = exitFocus.current;
    exitFocus.current = null;
    if (id) document.getElementById(id)?.focus();
  };
  // Focus after an action that shuts the sheet waits for the close; otherwise it is immediate.
  const focusAfterAction = (id: string) => {
    if (sheetOpen) exitFocus.current = id;
    else setFocusId(id);
  };
  // Rows whose Save or Confirm was blocked, so their panels show every error.
  const [blocked, setBlocked] = useState<Record<string, boolean>>({});
  // Focus moves to the next row in display order, else the Excluded button, rather than being lost to the page.
  const remove = (key: string) => {
    // Confident rows only exist on screen while that group is shown.
    const rendered = state.sureOpen
      ? [...groups.review, ...groups.sure]
      : groups.review;
    const order = rendered.map((l) => l.key);
    const next = order[order.indexOf(key) + 1];
    dispatch({ type: 'remove', key });
    focusAfterAction(next ? rowId(next) : EXCLUDED_TOGGLE_ID);
  };
  const restore = (key: string) => {
    dispatch({ type: 'restore', key });
    // The phone does not open a sheet for an added-back line: the Member taps its row.
    if (phone) dispatch({ type: 'close', key });
    setFocusId(rowId(key));
  };
  /** Open the first line with an invalid value and focus that field. Returns whether there was one. */
  const focusInvalid = (candidates: ReviewLine[]) => {
    const line = candidates.find((l) => invalidFields(l).length > 0);
    if (!line) return false;
    const field = invalidFields(line)[0];
    const target = phone ? sheetFieldId(line, field) : fieldId(line.key, field);
    if (phone) {
      // A sheet that is already open takes focus now; one that is opening takes it once it has opened.
      const alreadyOpen = sheetOpen && sheetKey === line.key;
      setSheetKey(line.key);
      dispatch({ type: 'openOnly', key: line.key });
      if (alreadyOpen) setFocusId(target);
      else {
        enterFocus.current = target;
        blockedEntry.current = true;
      }
    } else {
      dispatch({ type: 'open', key: line.key });
      setFocusId(target);
    }
    setBlocked((was) => ({ ...was, [line.key]: true }));
    return true;
  };
  // Confirm and Done shut the row; an invalid value keeps it open and takes focus instead.
  const confirm = (key: string) => {
    const line = state.lines.find((l) => l.key === key);
    if (line && focusInvalid([line])) return;
    dispatch({ type: 'confirm', key });
    focusAfterAction(rowId(key));
  };

  /** Opens and focuses the first line with an invalid value; true when there was one. */

  const save = () => {
    // Display order, so the Member lands on the topmost problem.
    if (focusInvalid([...groups.review, ...groups.sure])) return;
    const to = '/pantry';
    const navState = unverifiedState(
      included.filter((l) => statusOf(l, !!state.confirmed[l.key]) === 'low')
        .length,
    );
    saver.mutate(
      { mode, scanLanguage: draft?.scanLanguage, lines: included },
      {
        onSuccess: (failures) => {
          const landing = leaveCard(to);
          if (host) {
            host.onSaved(included.length);
            return;
          }
          if (
            failures &&
            failures.missing + failures.changed + failures.other > 0
          ) {
            setTickFailures(failures);
            setSavedState({ landing, state: navState });
            return;
          }
          navigate(landing, { state: navState });
        },
      },
    );
  };
  const discard = () => {
    navigate(leaveCard('/scan'));
  };

  return {
    hadDraft: draft !== null,
    included,
    mode,
    state,
    groups,
    counts,
    parents: parents.data ?? [],
    canSave: included.length > 0 && overLimit === 0 && !saver.isPending,
    overLimit,
    maxItems: MAX_BULK_BATCHES,
    saving: saver.isPending,
    error: saver.error ? translateApiError(t, saver.error) : null,
    tickFailures,
    // After a tick-failure notice the toast still follows, on the Pantry the lines were saved to.
    toPantry: () =>
      navigate(savedState?.landing ?? '/pantry', { state: savedState?.state }),
    blocked,
    toggle,
    open,
    sheetKey,
    sheetOpen,
    openSheet,
    closeSheet,
    sheetInitialFocus,
    sheetEntered,
    sheetExited,
    change,
    swapName: swapLine ? displayName(swapLine) : '',
    swapQuery: swapInputs?.query ?? '',
    /** Undefined when the line lists none (never []), as the add-Batch form passes it. */
    swapAllergenIds: swapInputs?.allergenIds,
    swapOpen,
    openSwap,
    closeSwap,
    changeMatch,
    pickMatch,
    remove,
    restore,
    confirm,
    toggleSureGroup: () => dispatch({ type: 'toggleSureGroup' }),
    save,
    discard,
  };
}

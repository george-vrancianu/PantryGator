import { Alert, Button, Card, Spinner, Typography } from '@pocket-pantry/ui';
import { useEffect, useRef, useState, type Ref, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';

/** The item an open sheet is about, kept until the sheet has closed so it can slide away. */
export function useReviewSheet<T>() {
  const [item, setItem] = useState<T | null>(null);
  const [open, setOpen] = useState(false);
  return {
    item,
    open,
    show: (next: T) => {
      setItem(next);
      setOpen(true);
    },
    close: () => setOpen(false),
    exited: () => setItem(null),
  };
}

/**
 * Where focus goes once a sheet has closed: the result message after a link, promote, merge or add (the
 * row is gone), else the row (the Sheet already gave it back), else the list's heading when the row is gone.
 */
export function useSheetFocus(rowCount: number) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [notice, setNotice] = useState<HTMLDivElement | null>(null);
  const toNotice = useRef(false);
  // A row going (dismissed, restored, resolved elsewhere) takes focus with it: the heading is always there.
  const rows = useRef(rowCount);
  useEffect(() => {
    if (rowCount < rows.current) {
      const active = document.activeElement;
      if (!active || active === document.body) heading.current?.focus();
    }
    rows.current = rowCount;
  }, [rowCount]);
  // Counted when a sheet has closed; the effect runs once the sheet is gone from the page.
  const [exits, setExits] = useState(0);
  useEffect(() => {
    if (exits === 0) return;
    if (toNotice.current) {
      toNotice.current = false;
      notice?.focus();
      return;
    }
    const active = document.activeElement;
    if (!active || active === document.body) heading.current?.focus();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only a sheet closing moves focus, not the region mounting
  }, [exits]);
  return {
    heading,
    /** Give it to `QueueNotice` as `ref`. */
    setNotice,
    /** Ask for focus on the result message when the sheet has closed. */
    resultNext: () => {
      toNotice.current = true;
    },
    /** Call from the sheet's `onExited`, together with dropping the sheet's item. */
    afterExit: () => setExits((count) => count + 1),
  };
}

/** The polite live region that announces a result, and takes focus. */
export function QueueNotice({
  ref,
  message,
}: {
  ref: Ref<HTMLDivElement>;
  message: string | null;
}) {
  return (
    <div role="status" ref={ref} tabIndex={-1}>
      {message ? <Typography variant="body2">{message}</Typography> : null}
    </div>
  );
}

export function EmptyCard({ title, text }: { title: string; text: string }) {
  return (
    <Card sx={{ textAlign: 'center', px: 2.25, py: 2.75 }}>
      <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{title}</Typography>
      <Typography variant="meta" color="text.secondary">
        {text}
      </Typography>
    </Card>
  );
}

/** One hint line under the switch. */
export function HintLine({ children }: { children: string }) {
  return (
    <Typography variant="meta" color="text.secondary" sx={{ px: 0.5 }}>
      {children}
    </Typography>
  );
}

type PagedQuery = {
  error: unknown;
  isPending: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
};

/** The loading spinner, the error and the Load more button of a paged queue, with focus on the first new row. */
export function useLoadMore(
  queue: PagedQuery,
  count: number,
  listRef: RefObject<HTMLUListElement | null>,
) {
  const { t } = useTranslation(['admin', 'common', 'errors']);
  // Index of the first row a Load more brings in, until focus has moved there.
  const [focusFrom, setFocusFrom] = useState<number | null>(null);
  useEffect(() => {
    if (focusFrom === null || queue.isFetchingNextPage) return;
    const item = listRef.current?.children[focusFrom];
    const target =
      item instanceof HTMLElement && item.tabIndex >= 0
        ? item
        : item?.querySelector<HTMLElement>('[data-review-row]');
    target?.focus();
    // oxlint-disable-next-line react/set-state-in-effect -- one-shot focus request: focus is moved, then the request is cleared
    setFocusFrom(null);
  }, [focusFrom, queue.isFetchingNextPage, listRef]);
  return {
    status: (
      <>
        {queue.error ? (
          <Alert>{translateApiError(t, queue.error)}</Alert>
        ) : null}
        {queue.isPending ? <Spinner label={t('common:loading')} /> : null}
      </>
    ),
    loadMore: queue.hasNextPage ? (
      <Button
        variant="secondary"
        aria-disabled={queue.isFetchingNextPage}
        onClick={() => {
          if (queue.isFetchingNextPage) return;
          setFocusFrom(count);
          void queue.fetchNextPage();
        }}
      >
        {t('admin:unmatched.loadMore')}
      </Button>
    ) : null,
  };
}

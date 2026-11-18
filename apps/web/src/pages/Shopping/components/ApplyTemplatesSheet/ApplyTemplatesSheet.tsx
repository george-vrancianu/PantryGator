import {
  Alert,
  Box,
  Card,
  CheckIcon,
  ChevronRightIcon,
  color as themeColor,
  Link,
  MinusIcon,
  Sheet,
  Spinner,
  TemplateIcon,
  Typography,
  insetFocusRing,
  radius,
  tokens,
  useToast,
} from '@pocket-pantry/ui';
import { useQueries } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import {
  SHOPPING_TOAST_MS,
  useShoppingList,
  type ShoppingList,
} from '@/lib/shopping';
import {
  templateQueryOptions,
  useApplyTemplate,
  useTemplates,
  type Template,
  type TemplateLine,
  type TemplateSummary,
} from '@/lib/shoppingTemplates';
import {
  bulkBody,
  emptySelection,
  includeTemplate,
  isLineTicked,
  lineTag,
  lineTagKey,
  removeTemplate,
  summarize,
  templateState,
  toggleLine,
  type Selection,
  type TemplateState,
} from '@/lib/templateSelection';

export type ApplyTemplatesSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Called once the close transition has finished. */
  onExited?: () => void;
};

/**
 * The Import sheet: applies several Shopping Templates to the Shopping List in
 * one go ("Import" is only the UI label). Closing resets it; the body remounts
 * on each opening so nothing is included and every row is collapsed.
 */
export function ApplyTemplatesSheet({
  open,
  onClose,
  onExited,
}: ApplyTemplatesSheetProps) {
  const [form, setForm] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm((n) => n + 1);
  }
  return (
    <ApplyForm key={form} open={open} onClose={onClose} onExited={onExited} />
  );
}

function ApplyForm({ open, onClose, onExited }: ApplyTemplatesSheetProps) {
  const { t } = useTranslation(['shopping', 'templates', 'common']);
  const toast = useToast();
  const templates = useTemplates();
  const shoppingList = useShoppingList();
  const apply = useApplyTemplate();
  const [selection, setSelection] = useState<Selection>(emptySelection);
  // Templates ticked while their lines are still loading.
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

  const summaries = templates.data ?? [];
  // Rows the Member has opened to pick lines.
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(new Set());
  // Details are fetched only for Templates the Member has ticked or opened.
  const detailQueries = useQueries({
    queries: summaries.map((summary) => ({
      ...templateQueryOptions(summary.id),
      enabled:
        pending.has(summary.id) ||
        selection.has(summary.id) ||
        openRows.has(summary.id),
    })),
  });
  const details = new Map<string, Template>();
  summaries.forEach((summary, index) => {
    const data = detailQueries[index]?.data;
    if (data) details.set(summary.id, data);
  });
  // Templates whose lines failed to load; local, so closing the sheet clears it.
  const [failed, setFailed] = useState<ReadonlyMap<string, unknown>>(new Map());
  const detailsError = [...failed.values()][0];
  const listSettled = !shoppingList.isPending;

  // A ticked Template joins the selection once its lines (and the list the
  // default selection depends on) are here. One whose lines failed to load is
  // dropped; the error shows above.
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- deliberately every render: it reads the useQueries result array, which is a new array each render, and returns early unless a ticked Template has settled
  useEffect(() => {
    if (pending.size === 0 || !listSettled) return;
    // A cached error does not count while the retry is still running.
    const settled = summaries
      .map((summary, index) => ({
        id: summary.id,
        query: detailQueries[index],
      }))
      .filter(
        ({ id, query }) =>
          pending.has(id) &&
          (query?.data || (query?.isError && query.fetchStatus === 'idle')),
      );
    if (settled.length === 0) return;
    setSelection((current) =>
      settled.reduce(
        (next, { query }) =>
          query?.data
            ? includeTemplate(next, query.data, shoppingList.data)
            : next,
        current,
      ),
    );
    const errors = settled.filter(({ query }) => !query?.data);
    if (errors.length > 0) {
      setFailed((current) => {
        const next = new Map(current);
        errors.forEach(({ id, query }) => next.set(id, query?.error));
        return next;
      });
    }
    setPending((current) => {
      const next = new Set(current);
      settled.forEach(({ id }) => next.delete(id));
      return next;
    });
  });

  const tick = (summary: TemplateSummary, index: number) => {
    if (selection.has(summary.id)) {
      setSelection(removeTemplate(selection, summary.id));
      return;
    }
    // A fetch that failed while the row was only open is retried by the tick.
    const query = detailQueries[index];
    if (query?.isError && query.fetchStatus === 'idle') void query.refetch();
    setFailed((current) => {
      const next = new Map(current);
      next.delete(summary.id);
      return next;
    });
    setPending((current) => {
      const next = new Set(current);
      if (!next.delete(summary.id)) next.add(summary.id);
      return next;
    });
  };

  const toggleOpen = (id: string) =>
    setOpenRows((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const included = summaries.filter((s) => selection.has(s.id));
  const loaded = included.flatMap((s) => details.get(s.id) ?? []);
  const summary = summarize(selection, loaded);
  const pickedNames = summary.templates.map((template) => template.name);

  const submit = () =>
    apply.mutate(bulkBody(selection, loaded), {
      onSuccess: () => {
        onClose();
        toast.show(
          pickedNames.length === 1
            ? t('shopping:import.done', {
                count: summary.items,
                name: pickedNames[0],
              })
            : t('shopping:import.doneMany', {
                count: summary.items,
                templates: t('shopping:import.templateCount', {
                  count: pickedNames.length,
                }),
              }),
          { duration: SHOPPING_TOAST_MS, polite: true },
        );
      },
    });

  const canApply =
    summary.items > 0 &&
    !summary.overCap &&
    !summaries.some((s) => pending.has(s.id)) &&
    !apply.isPending;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      onExited={onExited}
      title={t('shopping:import.title')}
      primary={{
        label: apply.isPending
          ? t('shopping:import.pending')
          : summary.items === 0
            ? t('shopping:import.pickOne')
            : t('shopping:import.confirm', { count: summary.items }),
        disabled: !canApply,
        pending: apply.isPending,
        onClick: submit,
      }}
    >
      <Box
        sx={{
          p: '4px 20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2.25,
        }}
      >
        {apply.error ? (
          <Alert>{translateApiError(t, apply.error)}</Alert>
        ) : null}
        {detailsError ? (
          <Alert>{translateApiError(t, detailsError)}</Alert>
        ) : null}
        <Typography variant="meta" sx={{ color: tokens.color.muted }}>
          {t('shopping:import.hint')}
        </Typography>
        <Box component="section">
          <Box
            sx={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              mb: 1,
            }}
          >
            <Typography
              component="h3"
              variant="sectionLabel"
              sx={{ color: tokens.color.muted }}
            >
              {t('shopping:import.section', { count: summaries.length })}
            </Typography>
            <Link href="/shopping/templates">
              {t('shopping:import.manage')}
            </Link>
          </Box>
          {templates.isPending ? <Spinner label={t('common:loading')} /> : null}
          {templates.error ? (
            <Alert>{translateApiError(t, templates.error)}</Alert>
          ) : null}
          {templates.data && summaries.length === 0 ? (
            <Card
              variant="list"
              sx={{ p: 2, fontSize: 13.5, color: tokens.color.muted }}
            >
              {t('shopping:import.none')}
            </Card>
          ) : null}
          {summaries.length > 0 ? (
            <Card variant="list" sx={{ p: 0 }}>
              {summaries.map((row, index) => {
                const detail = details.get(row.id);
                return (
                  <TemplateRow
                    key={row.id}
                    summary={row}
                    state={
                      detail ? templateState(selection, detail) : 'excluded'
                    }
                    loading={pending.has(row.id)}
                    ticked={selection.get(row.id)?.size ?? 0}
                    total={detail?.lines.length ?? row.lineCount}
                    onTick={() => tick(row, index)}
                    open={openRows.has(row.id)}
                    onToggleOpen={() => toggleOpen(row.id)}
                    lines={
                      detail && listSettled ? (
                        <TemplateLines
                          detail={detail}
                          selection={selection}
                          list={shoppingList.data}
                          onLineTap={(l) =>
                            setSelection((current) =>
                              toggleLine(current, detail, l, shoppingList.data),
                            )
                          }
                        />
                      ) : detailQueries[index]?.isError &&
                        detailQueries[index]?.fetchStatus === 'idle' ? (
                        // A ticked row's failure already shows in the sheet-level alert.
                        failed.has(row.id) ? null : (
                          <Box sx={{ p: 1.5 }}>
                            <Alert>
                              {translateApiError(
                                t,
                                detailQueries[index]?.error,
                              )}
                            </Alert>
                          </Box>
                        )
                      ) : (
                        <Box sx={{ p: 2 }}>
                          <Spinner label={t('common:loading')} />
                        </Box>
                      )
                    }
                  />
                );
              })}
            </Card>
          ) : null}
        </Box>
        {included.length > 0 ? (
          <Typography
            variant="meta"
            sx={{
              textAlign: 'center',
              color: tokens.color.muted,
              // Stays above the pinned Import so the reason it is disabled never scrolls away.
              position: 'sticky',
              bottom: 0,
              mx: '-20px',
              px: '20px',
              py: 1,
              backgroundColor: tokens.color.bg,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {summary.overCap
              ? t('shopping:import.tooMany')
              : [
                  t('shopping:import.from', {
                    names: included.map((s) => s.name).join(', '),
                  }),
                  ...(summary.repeats > 0
                    ? [t('shopping:import.repeats', { count: summary.repeats })]
                    : []),
                ].join(' · ')}
          </Typography>
        ) : null}
      </Box>
    </Sheet>
  );
}

type TemplateRowProps = {
  summary: TemplateSummary;
  state: TemplateState;
  /** The Template's lines are still loading after a tick. */
  loading: boolean;
  ticked: number;
  total: number;
  onTick: () => void;
  open: boolean;
  onToggleOpen: () => void;
  /** The nested lines, shown while the row is open. */
  lines: React.ReactNode;
};

/**
 * One collapsed Template row: the tick on the left, the Template's name and
 * summary line next to it. Opening a row to pick lines nests them under it.
 */
function TemplateRow({
  summary,
  state,
  loading,
  ticked,
  total,
  onTick,
  open,
  onToggleOpen,
  lines,
}: TemplateRowProps) {
  const linesId = useId();
  const { t } = useTranslation(['shopping', 'templates']);
  const { color } = tokens;
  const included = state !== 'excluded';
  return (
    <Box sx={{ '& + &': { borderTop: `1px solid ${color.divider}` } }}>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Box
          component="button"
          type="button"
          role="checkbox"
          aria-checked={
            state === 'all' ? true : state === 'mixed' ? 'mixed' : false
          }
          aria-label={t('shopping:import.tickLabel', { name: summary.name })}
          aria-busy={loading}
          onClick={onTick}
          sx={{
            p: '12px 4px 12px 14px',
            border: 0,
            backgroundColor: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            ...insetFocusRing,
          }}
        >
          <Box
            aria-hidden
            sx={{
              width: 24,
              height: 24,
              display: 'grid',
              placeItems: 'center',
              borderRadius: radius.box,
              border: `2px solid ${included ? color.accent : color.tickBorder}`,
              backgroundColor:
                state === 'all'
                  ? color.accent
                  : state === 'mixed'
                    ? color.accentTint
                    : 'transparent',
              color: state === 'all' ? themeColor.accentInk : color.accent,
              '& .MuiCircularProgress-root': {
                width: '14px !important',
                height: '14px !important',
              },
            }}
          >
            {loading ? (
              <Spinner label="" />
            ) : state === 'all' ? (
              <CheckIcon size={14} />
            ) : state === 'mixed' ? (
              <MinusIcon size={14} />
            ) : null}
          </Box>
        </Box>
        <Box
          component="button"
          type="button"
          aria-expanded={open}
          aria-controls={linesId}
          onClick={onToggleOpen}
          sx={{
            flex: 1,
            minWidth: 0,
            p: '10px 14px 10px 6px',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            border: 0,
            backgroundColor: 'transparent',
            color: 'inherit',
            font: 'inherit',
            textAlign: 'left',
            cursor: 'pointer',
            ...insetFocusRing,
          }}
        >
          <Box
            aria-hidden
            sx={{
              flexShrink: 0,
              width: 36,
              height: 36,
              display: 'grid',
              placeItems: 'center',
              borderRadius: radius.control,
              backgroundColor: color.butter,
              color: color.butterInk,
            }}
          >
            <TemplateIcon size={20} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box
              sx={{
                fontSize: 15,
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {summary.name}
            </Box>
            <Box
              sx={{
                fontSize: 12.5,
                color: color.muted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {included
                ? t('shopping:import.selected', { ticked, total })
                : [
                    t('shopping:import.rowItems', { count: summary.lineCount }),
                    ...(summary.previewNames.length > 0
                      ? [summary.previewNames.slice(0, 3).join(', ')]
                      : []),
                  ].join(' · ')}
            </Box>
          </Box>
          <Box
            aria-hidden
            sx={{
              flexShrink: 0,
              display: 'grid',
              color: color.muted,
              transform: open ? 'rotate(90deg)' : 'none',
              transition: 'transform 150ms',
            }}
          >
            <ChevronRightIcon size={18} />
          </Box>
        </Box>
      </Box>
      <Box
        id={linesId}
        role={open ? 'group' : undefined}
        aria-label={open ? summary.name : undefined}
        hidden={!open}
        sx={{
          backgroundColor: color.subtle,
          borderTop: open ? `1px solid ${color.divider}` : 0,
        }}
      >
        {open ? lines : null}
      </Box>
    </Box>
  );
}

const okTag = { fg: tokens.color.okFg, bg: tokens.color.okBg };
const soonTag = { fg: tokens.color.soonFg, bg: tokens.color.soonBg };

/** The Import sheet words the On list tag "adds up"; the editor keeps plain "On list". */
const importTagKey = { ...lineTagKey, onList: 'shopping:import.onListAddsUp' };

type TemplateLinesProps = {
  detail: Template;
  selection: Selection;
  list: ShoppingList | undefined;
  onLineTap: (line: TemplateLine) => void;
};

/** A Template's lines in its own order, each the apply view's line row. */
function TemplateLines({
  detail,
  selection,
  list,
  onLineTap,
}: TemplateLinesProps) {
  const { t } = useTranslation(['shopping', 'templates', 'common']);
  const { color } = tokens;
  if (detail.lines.length === 0) {
    return (
      <Box sx={{ p: '12px 14px 12px 28px', fontSize: 13, color: color.muted }}>
        {t('templates:apply.empty')}
      </Box>
    );
  }
  return (
    <Box sx={{ pl: '28px' }}>
      {detail.lines.map((line) => {
        const on = isLineTicked(selection, detail.id, line.id);
        const kind = lineTag(line, list);
        const tag = kind
          ? {
              text: t(importTagKey[kind]),
              ...(kind === 'onList' ? soonTag : okTag),
            }
          : null;
        const amount =
          line.quantity === null
            ? ''
            : line.unit
              ? `${line.quantity} ${t(`common:units.${line.unit}`)}`
              : String(line.quantity);
        return (
          <Box
            key={line.id}
            component="button"
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onLineTap(line)}
            sx={{
              width: '100%',
              minHeight: 50,
              p: '8px 14px 8px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              border: 0,
              backgroundColor: 'transparent',
              color: 'inherit',
              font: 'inherit',
              textAlign: 'left',
              cursor: 'pointer',
              '& + &': { borderTop: `1px solid ${color.divider}` },
              ...insetFocusRing,
            }}
          >
            <Box
              aria-hidden
              sx={{
                flexShrink: 0,
                width: 24,
                height: 24,
                display: 'grid',
                placeItems: 'center',
                borderRadius: radius.box,
                border: `2px solid ${on ? color.accent : color.tickBorder}`,
                backgroundColor: on ? color.accent : 'transparent',
                color: themeColor.accentInk,
              }}
            >
              {on ? <CheckIcon size={14} /> : null}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ fontSize: 15, fontWeight: 600 }}>{line.name}</Box>
              {amount ? (
                <Box sx={{ fontSize: 13, fontWeight: 500, color: color.muted }}>
                  {amount}
                </Box>
              ) : null}
            </Box>
            {tag ? (
              <Box
                component="span"
                sx={{
                  px: 1.25,
                  py: 0.25,
                  borderRadius: radius.tag,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: tag.fg,
                  backgroundColor: tag.bg,
                }}
              >
                {tag.text}
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}

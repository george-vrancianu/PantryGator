import {
  Alert,
  Box,
  Button,
  ListRow,
  SwipeRow,
  type SwipeRowHandle,
  Spinner,
  Stack,
  TextField,
  Typography,
  useToast,
  type ToastHandle,
} from '@pocket-pantry/ui';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Screen } from '@/components/layout/Screen/Screen';
import { ConfirmAction } from '@/components/editor/ConfirmAction/ConfirmAction';
import {
  AmountSheet,
  type Amount,
} from '../components/AmountSheet/AmountSheet';
import { formatRowAmount } from '@/lib/amount';
import { translateApiError } from '@/i18n/translateApiError';
import { useUndoToast } from '@/lib/useUndoToast';
import { RowHintNote } from '@/components/lists/RowHintNote/RowHintNote';
import { useRowHint, type RowHint } from '@/lib/useRowHint';
import { useSwipeRowLabels } from '@/lib/useSwipeRowLabels';
import type { NewShoppingItem } from '@/lib/shopping';
import {
  MAX_TEMPLATE_LINES,
  toLineBody,
  type TemplateLine,
  useTemplate,
  useTemplateMutations,
  type Template,
} from '@/lib/shoppingTemplates';
import { AddItemForm } from '../components/AddItemForm/AddItemForm';
import { ApplyTemplatePicker } from './ApplyTemplatePicker/ApplyTemplatePicker';

/** Rename a Template, add lines with Catalog search, remove lines, delete it, or apply it. */
export function TemplateEditorPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation(['templates', 'common', 'screenHeader']);
  const template = useTemplate(id);
  const [applying, setApplying] = useState(false);

  if (applying) {
    return (
      <Screen title={t('templates:title')}>
        <ApplyTemplatePicker
          templateId={id}
          onDone={() => setApplying(false)}
          onCancel={() => setApplying(false)}
        />
      </Screen>
    );
  }

  if (template.data) {
    return (
      <Editor
        key={template.data.id}
        template={template.data}
        onApply={() => setApplying(true)}
      />
    );
  }

  return (
    <Screen
      title={t('templates:title')}
      back={{ label: t('screenHeader:back'), href: '/shopping/templates' }}
    >
      {template.isPending ? <Spinner label={t('common:loading')} /> : null}
      {template.error ? (
        <Alert>{translateApiError(t, template.error)}</Alert>
      ) : null}
    </Screen>
  );
}

function Editor({
  template,
  onApply,
}: {
  template: Template;
  onApply: () => void;
}) {
  const { t } = useTranslation(['templates', 'common', 'screenHeader']);
  const navigate = useNavigate();
  const { update, remove } = useTemplateMutations();
  const [name, setName] = useState(template.name);

  const lines = template.lines;
  const [rowKeys, retireKey] = useStableLineKeys(lines);
  const hint = useRowHint('template', lines.length > 0);
  const full = lines.length >= MAX_TEMPLATE_LINES;

  // Commits a pending name change; resolves false (the page's alert shows why) when the save fails.
  const commitName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === template.name) return true;
    try {
      await update.mutateAsync({ id: template.id, name: trimmed });
      return true;
    } catch {
      return false;
    }
  };
  const rename = (event: FormEvent) => {
    event.preventDefault();
    void commitName();
  };
  // Lines save as you go, but the name does not: the gold Save key commits it, then leaves for the list.
  const saveAndLeave = async () => {
    if (await commitName()) navigate('/shopping/templates');
  };

  // The newest lines we know of: the page's, or the last save's reply. Undo builds on these, not on
  // what the page rendered when the toast appeared.
  const latest = useRef(lines);
  useLayoutEffect(() => {
    latest.current = lines;
  });
  // Saves run one at a time, each building its lines from the newest we know of once the one before it
  // has landed: a second swipe during the first row's fly-off must not bring the first line back.
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  // `build` returns null when there is nothing left to save: no request goes out.
  const save = (
    build: (current: TemplateLine[]) => NewShoppingItem[] | null,
  ) => {
    const request = saving.current.then(() => {
      const next = build(latest.current);
      if (!next) return undefined;
      return update
        .mutateAsync({ id: template.id, lines: next })
        .then((saved) => {
          latest.current = saved.lines;
          return saved;
        });
    });
    saving.current = request.then(
      () => undefined,
      () => undefined,
    );
    return request;
  };

  // Removing a Template Line saves at once, without it (ADR 0009: the exception, because a line is only
  // a name, an amount and a unit). Undo saves the lines again with it back at its old position.
  const { showUndo } = useUndoToast();
  // The toast outlives this page, but Undo builds on this instance's refs: take it down when we go.
  const undoToast = useRef<ToastHandle | null>(null);
  useEffect(() => () => undoToast.current?.close(), []);
  const removeLine = async (line: TemplateLine) => {
    // Its row is collapsing: no other line may take over its key.
    retireKey(line);
    let index = 0;
    let gone = false;
    await save((current) => {
      const at = indexOfLine(current, line);
      if (at === -1) {
        // Already gone (removed elsewhere): nothing to save, and nothing to Undo.
        gone = true;
        return null;
      }
      index = at;
      return current.filter((_, i) => i !== at).map(toLineBody);
    });
    if (gone) return;
    undoToast.current = showUndo(
      t('common:row.removed', { name: line.name }),
      () => {
        void restore(line, index);
      },
    );
  };
  // The row index to focus once the list shows again after an Undo from an emptied Template.
  const pendingFocusIndex = useRef<number | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const restore = async (line: TemplateLine, index: number) => {
    // Queued behind any save still in flight, so the line goes back on top of it.
    // A failure shows in the page's alert.
    // Undo from an emptied Template: the list is about to remount, so focus its row once it does.
    await save((current) => {
      // Decided when this save is built, after the saves queued before it have landed.
      if (current.length === 0) pendingFocusIndex.current = 0;
      const next = current.map(toLineBody);
      next.splice(Math.min(index, next.length), 0, toLineBody(line));
      return next;
    }).catch(() => {
      pendingFocusIndex.current = null;
    });
  };
  useEffect(() => {
    if (pendingFocusIndex.current === null || lines.length === 0) return;
    // Every child of the list is a LineRow.
    const row = list.current?.children[
      Math.min(pendingFocusIndex.current, lines.length - 1)
    ] as HTMLElement | undefined;
    row?.focus();
    pendingFocusIndex.current = null;
  }, [lines]);

  // The sheet shows a failed save itself, so the page's alert does not repeat it.
  const setAmount = (line: TemplateLine, amount: Amount) =>
    save((current) =>
      current.map((l, i) =>
        toLineBody(i === indexOfLine(current, line) ? { ...l, ...amount } : l),
      ),
    ).catch((failure: unknown) => {
      update.reset();
      throw failure;
    });

  // Removing the last line unmounts the list that held focus: hand it to the empty text.
  const empty = useRef<HTMLElement>(null);
  const hadLines = useRef(lines.length > 0);
  useEffect(() => {
    if (lines.length === 0 && hadLines.current) {
      const active = document.activeElement;
      if (!active || active === document.body) empty.current?.focus();
    }
    hadLines.current = lines.length > 0;
  }, [lines.length]);

  const add = (item: NewShoppingItem) =>
    save((current) => [...current.map(toLineBody), item]).then(
      () => true,
      () => false,
    );

  const error = update.error ?? remove.error;

  return (
    <Screen
      title={template.name}
      back={{ label: t('screenHeader:back'), href: '/shopping/templates' }}
      primary={{
        label: t('templates:editor.save'),
        text: t('templates:editor.save'),
        onClick: () => void saveAndLeave(),
        disabled: update.isPending,
      }}
    >
      <Stack spacing={2.5}>
        <RowHintNote hint={hint} />
        {error ? <Alert>{translateApiError(t, error)}</Alert> : null}
        <Box component="form" onSubmit={rename} noValidate>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <TextField
              label={t('templates:editor.name')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
          </Stack>
        </Box>

        {lines.length === 0 ? (
          <Typography
            ref={empty}
            tabIndex={-1}
            color="text.secondary"
            sx={{ outline: 'none' }}
          >
            {t('templates:editor.empty')}
          </Typography>
        ) : (
          <Stack
            ref={list}
            component="ul"
            sx={{ listStyle: 'none', m: 0, p: 0 }}
          >
            {lines.map((line, index) => (
              <LineRow
                key={rowKeys[index]}
                line={line}
                peek={index === 0 && hint.peek}
                onLearned={hint.onLearned}
                busy={update.isPending}
                onRemove={removeLine}
                onSetAmount={setAmount}
              />
            ))}
          </Stack>
        )}

        {full ? null : <AddItemForm adding={update.isPending} onAdd={add} />}

        <Button onClick={onApply} disabled={lines.length === 0}>
          {t('templates:editor.apply')}
        </Button>
        <ConfirmAction
          label={t('templates:editor.delete')}
          message={t('templates:editor.deleteConfirm')}
          disabled={remove.isPending}
          onConfirm={() =>
            remove.mutate(template.id, {
              onSuccess: () => navigate('/shopping/templates'),
            })
          }
        />
      </Stack>
    </Screen>
  );
}

/**
 * Every save gives the lines new ids, so a row asked about before the save in front of it landed is found
 * again by its Ingredient, name and unit when its id is gone. -1 if it is gone.
 */
function indexOfLine(lines: TemplateLine[], line: TemplateLine) {
  const byId = lines.findIndex((l) => l.id === line.id);
  if (byId >= 0) return byId;
  return lines.findIndex((l) => sameLine(l, line));
}

function sameLine(a: TemplateLine, b: TemplateLine) {
  return (
    a.ingredientId === b.ingredientId && a.name === b.name && a.unit === b.unit
  );
}

/**
 * A React key for each line that survives a save. Every save gives the lines new ids, and a row that
 * remounts loses its pending removal (its timers go with it). A line keeps its key when its id is
 * unchanged, else it takes the key of the first old line with the same Ingredient, name and unit that no
 * other line has claimed (so two lines sharing an Ingredient never share a key).
 */
function useStableLineKeys(lines: TemplateLine[]) {
  const [state, setState] = useState<{
    lines: TemplateLine[];
    keys: string[];
    next: number;
    retired: string[];
  }>({ lines: [], keys: [], next: 0, retired: [] });
  /** The row of this line is being removed (collapsing, inert): its key must not pass to another line. */
  const retire = (line: TemplateLine) =>
    setState((s) => {
      const at = indexOfLine(s.lines, line);
      const key = s.keys[at];
      return key === undefined || s.retired.includes(key)
        ? s
        : { ...s, retired: [...s.retired, key] };
    });
  if (state.lines !== lines) {
    const claimed = new Set<number>();
    const find = (match: (l: TemplateLine) => boolean) => {
      const at = state.lines.findIndex((l, i) => !claimed.has(i) && match(l));
      if (at >= 0) claimed.add(at);
      return at;
    };
    let next = state.next;
    const keys = lines.map((line) => {
      let at = find((l) => l.id === line.id);
      if (at < 0) {
        at = find(
          (l) =>
            sameLine(l, line) &&
            !state.retired.includes(state.keys[state.lines.indexOf(l)]!),
        );
      }
      return at >= 0 ? state.keys[at]! : `line-${++next}`;
    });
    const updated = { ...state, lines, keys, next };
    // Derived from props during render (React's pattern for state that follows props).
    setState(updated);
    return [keys, retire] as const;
  }
  return [state.keys, retire] as const;
}

function LineRow({
  line,
  peek,
  onLearned,
  busy,
  onRemove,
  onSetAmount,
}: {
  line: TemplateLine;
  peek: boolean;
  onLearned: RowHint['onLearned'];
  /** A Template save is in flight: rows ignore gestures and keys until it lands. */
  busy: boolean;
  onRemove: (line: TemplateLine) => Promise<unknown>;
  onSetAmount: (line: TemplateLine, amount: Amount) => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation('common');
  const toast = useToast();
  const labels = useSwipeRowLabels(line.name, 'template', { hold: true });
  const [editing, setEditing] = useState(false);
  const row = useRef<SwipeRowHandle>(null);
  // Bumped when a removal fails: a swiped-off row stays flown off and inert, so it is mounted afresh.
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const meta = formatRowAmount(line, i18n.language, t);

  return (
    <>
      <SwipeRow
        key={attempt}
        ref={row}
        name={line.name}
        labels={labels}
        disabled={editing || busy}
        peek={peek}
        onLearned={onLearned}
        onEdit={() => setEditing(true)}
        onRemove={() => {
          // The page shows the failure; the row only has to be usable again.
          onRemove(line).catch(() => {
            if (mounted.current) setAttempt((n) => n + 1);
          });
        }}
      >
        <ListRow title={line.name} meta={meta} />
      </SwipeRow>
      <AmountSheet
        open={editing}
        name={line.name}
        context={t('row.context.template')}
        amount={{ quantity: line.quantity, unit: line.unit }}
        onSave={async (amount) => {
          await onSetAmount(line, amount);
          setEditing(false);
          toast.show(t('row.updated', { name: line.name }));
        }}
        onClose={() => setEditing(false)}
        removeLabel={t('edit.removeLine')}
        onRemove={() => row.current?.askToRemove()}
      />
    </>
  );
}

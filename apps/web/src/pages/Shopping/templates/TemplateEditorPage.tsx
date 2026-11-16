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
import { Screen } from '../../../components/layout/Screen';
import { ConfirmAction } from '../../../components/ConfirmAction';
import { AmountSheet, type Amount } from '../../../components/AmountSheet';
import { formatRowAmount } from '../../../lib/amount';
import { translateApiError } from '../../../i18n/translateApiError';
import { UNDO_WINDOW_MS } from '../../../lib/useDeferredRemoval';
import { RowHintNote } from '../../../components/RowHintNote';
import { useRowHint, type RowHint } from '../../../lib/useRowHint';
import { useSwipeRowLabels } from '../../../lib/useSwipeRowLabels';
import type { NewShoppingItem } from '../../../lib/shopping';
import {
  MAX_TEMPLATE_LINES,
  toLineBody,
  type TemplateLine,
  useTemplate,
  useTemplateMutations,
  type Template,
} from '../../../lib/shoppingTemplates';
import { AddItemForm } from '../components/AddItemForm';
import { ApplyTemplatePicker } from './ApplyTemplatePicker';

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
  const save = (build: (current: TemplateLine[]) => NewShoppingItem[]) => {
    const request = saving.current.then(() =>
      update
        .mutateAsync({ id: template.id, lines: build(latest.current) })
        .then((saved) => {
          latest.current = saved.lines;
          return saved;
        }),
    );
    saving.current = request.then(
      () => undefined,
      () => undefined,
    );
    return request;
  };

  // Removing a Template Line saves at once, without it (ADR 0009: the exception, because a line is only
  // a name, an amount and a unit). Undo saves the lines again with it back at its old position.
  const toast = useToast();
  // The toast outlives this page, but Undo builds on this instance's refs: take it down when we go.
  const undoToast = useRef<ToastHandle | null>(null);
  useEffect(() => () => undoToast.current?.close(), []);
  const removeLine = async (line: TemplateLine) => {
    let index = 0;
    await save((current) => {
      const at = indexOfLine(current, line);
      index = Math.max(0, at);
      return current.filter((_, i) => i !== at).map(toLineBody);
    });
    undoToast.current = toast.show(
      t('common:row.removed', { name: line.name }),
      {
        duration: UNDO_WINDOW_MS,
        action: {
          label: t('common:row.undo'),
          onClick: () => {
            void restore(line, index);
          },
        },
      },
    );
  };
  const restore = async (line: TemplateLine, index: number) => {
    // Queued behind any save still in flight, so the line goes back on top of it.
    // A failure shows in the page's alert.
    await save((current) => {
      const next = current.map(toLineBody);
      next.splice(Math.min(index, next.length), 0, toLineBody(line));
      return next;
    }).catch(() => undefined);
  };

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
          <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {lines.map((line, index) => (
              <LineRow
                key={line.id}
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
 * again by its Ingredient (or its name, for a line with none) when its id is gone. -1 if it is gone.
 */
function indexOfLine(lines: TemplateLine[], line: TemplateLine) {
  const byId = lines.findIndex((l) => l.id === line.id);
  if (byId >= 0) return byId;
  return lines.findIndex(
    (l) => l.ingredientId === line.ingredientId && l.name === line.name,
  );
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

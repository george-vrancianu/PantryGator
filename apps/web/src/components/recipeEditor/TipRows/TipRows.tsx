import {
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  IconButton,
  radius,
  Stack,
  TextField,
} from '@pocket-pantry/ui';
import { useState } from 'react';
import type { RecipeTip } from '@/lib/adminRecipes';

/** What the inline Tip rows need from the page: Tips save on blur, and a delete is deferred behind Undo. */
export type TipActions = {
  add: (text: string, stepId: string | null) => Promise<unknown>;
  update: (tipId: string, text: string) => void;
  remove: (tipId: string) => void;
  /** Move a Tip one place up or down among those of its group; leave out where Tips cannot be reordered. */
  move?: (tipId: string, offset: -1 | 1) => void;
  /** A move is being stored: the move buttons are blocked until it returns. */
  moving?: boolean;
};

/** The dashed, subtle look of a Tip row under its Step. */
const rowSx = {
  alignItems: 'center',
  bgcolor: 'pp.subtle',
  border: '1px dashed',
  borderColor: 'pp.lineStrong',
  borderRadius: radius.control,
  pl: 1.25,
} as const;

const Bulb = () => (
  <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>
    💡
  </span>
);

type RowProps = {
  tip: RecipeTip;
  label: string;
  placeholder: string;
  removeLabel: string;
  actions: TipActions;
  /** The names of the move buttons and whether the Tip is at either end; shown only when `actions.move` is. */
  order?: { up: string; down: string; first: boolean; last: boolean };
};

/** A saved Tip: bulb, input that saves a change on blur, the move buttons when it can be reordered, and ×. */
export function TipRow({
  tip,
  label,
  placeholder,
  removeLabel,
  actions,
  order,
}: RowProps) {
  const [text, setText] = useState(tip.text);
  return (
    <Stack direction="row" spacing={1} sx={rowSx}>
      <Bulb />
      <TextField
        size="small"
        multiline
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const value = text.trim();
          // A cleared Tip is not saved: it goes back to what it was.
          if (value === '') setText(tip.text);
          else if (value !== tip.text) actions.update(tip.id, value);
        }}
        sx={{ flex: 1 }}
        placeholder={placeholder}
        slotProps={{ htmlInput: { 'aria-label': label } }}
      />
      {actions.move && order ? (
        <>
          <IconButton
            tone="plain"
            size={40}
            label={order.up}
            ariaDisabled={order.first || actions.moving}
            onClick={() => actions.move?.(tip.id, -1)}
          >
            <ChevronUpIcon />
          </IconButton>
          <IconButton
            tone="plain"
            size={40}
            label={order.down}
            ariaDisabled={order.last || actions.moving}
            onClick={() => actions.move?.(tip.id, 1)}
          >
            <ChevronDownIcon />
          </IconButton>
        </>
      ) : null}
      <IconButton
        tone="plain"
        size={40}
        label={removeLabel}
        onClick={() => actions.remove(tip.id)}
      >
        <CloseIcon />
      </IconButton>
    </Stack>
  );
}

type NewProps = {
  label: string;
  placeholder: string;
  removeLabel: string;
  stepId: string | null;
  actions: TipActions;
  /** The row has saved or been left empty. */
  onDone: () => void;
};

/** A blank Tip row: saves on blur when it has text, and goes away when it has none. */
export function NewTipRow({
  label,
  placeholder,
  removeLabel,
  stepId,
  actions,
  onDone,
}: NewProps) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const save = () => {
    const value = text.trim();
    if (saving) return;
    if (value === '') return onDone();
    setSaving(true);
    actions.add(value, stepId).then(onDone, () => setSaving(false));
  };
  return (
    <Stack direction="row" spacing={1} sx={rowSx}>
      <Bulb />
      <TextField
        size="small"
        multiline
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={save}
        sx={{ flex: 1 }}
        placeholder={placeholder}
        slotProps={{ htmlInput: { 'aria-label': label } }}
      />
      <IconButton
        tone="plain"
        size={40}
        label={removeLabel}
        // Pressing × with a pointer blurs the field first, which would save; the row is simply dropped instead. (Tabbing to × still saves.)
        onMouseDown={(event) => event.preventDefault()}
        onClick={onDone}
      >
        <CloseIcon />
      </IconButton>
    </Stack>
  );
}

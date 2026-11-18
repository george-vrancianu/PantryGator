import {
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
};

/** A saved Tip: bulb, input that saves a change on blur, and ×. */
export function TipRow({
  tip,
  label,
  placeholder,
  removeLabel,
  actions,
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

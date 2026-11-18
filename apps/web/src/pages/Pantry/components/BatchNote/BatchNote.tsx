import { Box, TextField } from '@pocket-pantry/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
};

/**
 * The Product Description as a note: folded behind "+ Add a note (brand, size)" until the Member opens it,
 * and open for good once it holds text (a Prefill fills it).
 */
export function BatchNote({ id, value, onChange }: Props) {
  const { t } = useTranslation('pantry');
  const [revealed, setRevealed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Once shown it stays shown: deleting a Prefill's text must not fold the field under the Member's fingers.
  if (value !== '' && !revealed) setRevealed(true);
  const open = revealed || value !== '';
  // Focus the field the Member just unfolded; one that Prefill opened is left alone.
  const focusOnOpen = useRef(false);
  useEffect(() => {
    if (open && focusOnOpen.current) input.current?.focus();
    focusOnOpen.current = false;
  }, [open]);

  if (!open)
    return (
      <Box
        component="button"
        type="button"
        onClick={() => {
          focusOnOpen.current = true;
          setRevealed(true);
        }}
        sx={{
          alignSelf: 'flex-start',
          p: 0,
          border: 'none',
          background: 'none',
          font: 'inherit',
          fontSize: 13.5,
          fontWeight: 700,
          color: 'pp.accent',
          cursor: 'pointer',
        }}
      >
        {t('form.addNote')}
      </Box>
    );
  return (
    <TextField
      id={id}
      inputRef={input}
      label={t('form.description')}
      placeholder={t('form.descriptionPlaceholder')}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{ htmlInput: { maxLength: 200 } }}
    />
  );
}

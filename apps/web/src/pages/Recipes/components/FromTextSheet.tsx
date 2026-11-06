import {
  Alert,
  Box,
  Button,
  CookbookIcon,
  Sheet,
  Stack,
  TextField,
  Typography,
  radius,
} from '@pocket-pantry/ui';
import { useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { CreditPrice } from '../../../components/CreditPrice';
import { useCreditPrice } from '../../../lib/credits';
import { ReadingLanguageChoice } from '../../../components/ReadingLanguageChoice';
import { MAX_HELD_RECIPE_READS, recipeReads } from '../../../lib/recipeReads';
import {
  MAX_PASTED_TEXT_LENGTH,
  type ReadingLanguage,
} from '../../../lib/linkRecipe';

/** What a failed link read's "Paste text instead" hands the Recipes page (under `FROM_TEXT_PREFILL_STATE`): the site to name, and the read the text replaces. */
export type FromTextPrefill = { site: string | null; replaces: number };

/** The character count appears from here, so a Member nears the limit knowingly. */
export const CHARACTER_COUNT_FROM = 45_000;

/** The editor's 44 pt field. */
const fieldSx = {
  '& .MuiOutlinedInput-root': { minHeight: 44, borderRadius: radius.control },
};

type PasteNote = 'empty' | 'refused' | 'tooLong';

/**
 * "From text", a sheet over Recipes: the Member pastes a recipe's text and the read goes to the
 * link-read holder, like a Recipe from Link started another way. Submitting closes the sheet; the read
 * carries on in the background strip. The holder keeps at most five reads: a sixth is refused here.
 */
export function FromTextSheet({
  open,
  onClose,
  onExited,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  onExited?: () => void;
  /** Opens for a failed link read: its site is named, and the text replaces that read. */
  prefill?: FromTextPrefill;
}) {
  const { t } = useTranslation('recipes');
  const field = useRef<HTMLTextAreaElement>(null);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      onExited={onExited}
      // A failed link read's text field takes focus once the sheet has opened (a phone keeps it unfocused, ADR 0039).
      initialFocus={prefill ? field : undefined}
      size="content"
      label={t('fromText.heading')}
    >
      <FromTextForm onSubmitted={onClose} prefill={prefill} field={field} />
    </Sheet>
  );
}

/** Mounted afresh each time the sheet opens, so an earlier read's text is never left in the field. */
function FromTextForm({
  onSubmitted,
  prefill,
  field,
}: {
  onSubmitted: () => void;
  prefill?: FromTextPrefill;
  field: RefObject<HTMLTextAreaElement | null>;
}) {
  const { t, i18n } = useTranslation('recipes');
  const price = useCreditPrice('link-text');
  const [text, setText] = useState('');
  const [language, setLanguage] = useState<ReadingLanguage>('catalog');
  const [full, setFull] = useState(false);
  const [note, setNote] = useState<PasteNote | null>(null);
  const fieldId = useId();
  // Hidden where the browser cannot read the clipboard.
  const canPaste =
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.readText === 'function';

  const input = text.trim();

  const paste = async () => {
    let pasted: string;
    try {
      pasted = await navigator.clipboard.readText();
    } catch {
      return setNote('refused');
    }
    if (pasted.trim() === '') return setNote('empty');
    // Never truncated: a cut recipe would read as a different one.
    if (pasted.length > MAX_PASTED_TEXT_LENGTH) return setNote('tooLong');
    setNote(null);
    setFull(false);
    setText(pasted);
    field.current?.focus();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (input === '') return;
    const outcome = recipeReads.submit(
      { kind: 'text', text: input },
      language,
      prefill ? { replaces: prefill.replaces } : {},
    );
    if (outcome === 'full') setFull(true);
    else onSubmitted();
  };

  const atLimit = text.length >= MAX_PASTED_TEXT_LENGTH;

  return (
    <Stack
      component="form"
      spacing={2}
      noValidate
      onSubmit={submit}
      aria-label={t('fromText.heading')}
      sx={{ px: 2.5, pt: 1, pb: 2.5 }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <CookbookIcon size={24} aria-hidden="true" />
        <Typography component="h2" variant="h2">
          {t('fromText.heading')}
        </Typography>
      </Stack>
      <Typography color="text.secondary">
        {prefill?.site
          ? t('fromText.siteHint', { site: prefill.site })
          : t('fromText.hint')}
      </Typography>
      {full ? (
        <Alert>{t('fromLink.full', { count: MAX_HELD_RECIPE_READS })}</Alert>
      ) : null}
      <Box>
        <Typography
          component="label"
          htmlFor={fieldId}
          variant="sectionLabel"
          color="text.secondary"
          sx={{ display: 'block', mb: '6px' }}
        >
          {t('fromText.label')}
        </Typography>
        <TextField
          id={fieldId}
          multiline
          minRows={6}
          value={text}
          inputRef={field}
          onChange={(event) => {
            setFull(false);
            setNote(null);
            setText(event.target.value);
          }}
          sx={fieldSx}
          slotProps={{ htmlInput: { maxLength: MAX_PASTED_TEXT_LENGTH } }}
        />
        {text.length >= CHARACTER_COUNT_FROM ? (
          <Typography
            variant="meta"
            sx={{
              display: 'block',
              mt: '4px',
              textAlign: 'right',
              color: atLimit ? 'warning.main' : 'text.secondary',
            }}
          >
            {t('fromText.characters', {
              // Plural form follows the noun after {{max}}, which is always the limit.
              count: MAX_PASTED_TEXT_LENGTH,
              current: text.length.toLocaleString(i18n.language),
              max: MAX_PASTED_TEXT_LENGTH.toLocaleString(i18n.language),
            })}
          </Typography>
        ) : null}
      </Box>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {canPaste ? (
          <Button variant="secondary" onClick={() => void paste()}>
            {t('fromText.paste')}
          </Button>
        ) : null}
        {text !== '' ? (
          <Button
            variant="ghost"
            onClick={() => {
              setText('');
              setNote(null);
              setFull(false);
              field.current?.focus();
            }}
          >
            {t('fromText.clear')}
          </Button>
        ) : null}
      </Stack>
      {/* Polite: the note is information about a button the Member just pressed. */}
      <Box role="status" aria-live="polite">
        {note ? (
          <Typography variant="meta" color="text.secondary">
            {t(`fromText.note.${note}`)}
          </Typography>
        ) : null}
      </Box>
      <ReadingLanguageChoice
        value={language}
        onChange={setLanguage}
        input="text"
      />
      {price ? (
        <Typography variant="meta" color="text.secondary">
          <Trans
            t={t}
            i18nKey="fromText.price"
            components={{ price: <CreditPrice kind="link-text" /> }}
          />
        </Typography>
      ) : null}
      <Button type="submit" fullWidth disabled={input === ''}>
        {t('fromText.submit')}
      </Button>
    </Stack>
  );
}

import {
  Alert,
  Box,
  Sheet,
  Stack,
  TextField,
  Typography,
  radius,
} from '@pocket-pantry/ui';
import { useNavigate } from 'react-router-dom';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { CreditPrice } from '@/components/credits/CreditPrice/CreditPrice';
import { useCreditPrice } from '@/lib/credits';
import { ReadingLanguageChoice } from '../ReadingLanguageChoice/ReadingLanguageChoice';
import { MAX_HELD_RECIPE_READS, recipeReads } from '@/lib/recipeReads';
import {
  MAX_LINK_LENGTH,
  checkRecipeLink,
  type ReadingLanguage,
} from '@/lib/linkRecipe';
import { AlreadyInRecipes } from '../AlreadyInRecipes/AlreadyInRecipes';

/** The editor's 44 pt field. */
const fieldSx = {
  '& .MuiOutlinedInput-root': { minHeight: 44, borderRadius: radius.control },
  '& .MuiOutlinedInput-root:not(.MuiInputBase-multiline) input': {
    py: '10px',
  },
};

/**
 * "From a link", a sheet over Recipes: the Member gives the address of a recipe page and the read
 * goes to the link-read holder. Submitting closes the sheet; the read carries on in the background
 * strip, whatever page the Member goes to. The sheet reads nothing itself, so closing it never stops
 * a read.
 *
 * Pasted text has its own sheet ("From text"). The holder keeps at most five reads: a sixth is
 * refused here, asking the Member to review first.
 *
 * A link is checked first (a plain request that fetches nothing and costs nothing): if it is already
 * one of the Family's Recipes the sheet answers "Already in your Recipes" in place, with Open or Read
 * again. When the check fails the read goes ahead anyway; a duplicate it
 * missed is read as asked (the holder re-reads it with force).
 */
export function FromLinkSheet({
  open,
  onClose,
  onExited,
}: {
  open: boolean;
  onClose: () => void;
  onExited?: () => void;
}) {
  // A fresh body each time the sheet opens, so an earlier read's link is never left in the field.
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession(session + 1);
  }
  return (
    <FromLinkBody
      key={session}
      open={open}
      onClose={onClose}
      onExited={onExited}
    />
  );
}

function FromLinkBody({
  open,
  onClose,
  onExited,
}: {
  open: boolean;
  onClose: () => void;
  onExited?: () => void;
}) {
  const onSubmitted = onClose;
  const { t } = useTranslation('recipes');
  const formId = useId();
  const navigate = useNavigate();
  const linkPrice = useCreditPrice('link-page');
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState<ReadingLanguage>('catalog');
  const [full, setFull] = useState(false);
  const [checking, setChecking] = useState(false);
  /** The Family Recipe the submitted link already is; answered in place of the form. */
  const [duplicate, setDuplicate] = useState<{
    recipeId: string;
    read: () => void;
  } | null>(null);
  /** Aborts a check in flight when the sheet goes away. */
  const checkAbort = useRef<AbortController | null>(null);
  const duplicateHeading = useRef<HTMLHeadingElement>(null);
  const fieldId = useId();

  useEffect(() => () => checkAbort.current?.abort(), []);
  useEffect(() => {
    if (duplicate) duplicateHeading.current?.focus();
  }, [duplicate]);

  const input = url.trim();

  /** Holds the read; closes the sheet unless the holder is full. */
  const start = (force: boolean) => {
    const outcome = recipeReads.submit(
      { kind: 'link', url: input },
      language,
      force ? { force } : {},
    );
    if (outcome === 'full') {
      // Back to the form, where the alert lives (the duplicate panel has none).
      setDuplicate(null);
      setFull(true);
    } else onSubmitted();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (input === '' || checking) return;
    // A full holder refuses the read anyway: say so before asking the server anything.
    if (recipeReads.getState().reads.length >= MAX_HELD_RECIPE_READS) {
      return setFull(true);
    }
    const attempt = new AbortController();
    checkAbort.current = attempt;
    setChecking(true);
    let recipeId: string | null = null;
    try {
      recipeId = (await checkRecipeLink(input, attempt.signal)).recipeId;
    } catch {
      // The check is a courtesy: when it fails, read anyway (a duplicate it missed is forced through by the holder).
    }
    if (attempt.signal.aborted) return;
    setChecking(false);
    if (recipeId === null) return start(false);
    setDuplicate({ recipeId, read: () => start(true) });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      onExited={onExited}
      size="content"
      title={t('fromLink.heading')}
      primary={
        duplicate
          ? {
              label: t('fromLink.duplicate.open'),
              onClick: () => {
                // Close first: closing edits the address, and the Recipe's must come last.
                onSubmitted();
                navigate(`/recipes/${duplicate.recipeId}`);
              },
            }
          : {
              label: checking ? t('fromLink.checking') : t('fromLink.submit'),
              form: formId,
              pending: checking,
              disabled: input === '',
            }
      }
      secondary={
        duplicate
          ? {
              label: t('fromLink.duplicate.readAgain'),
              onClick: duplicate.read,
            }
          : undefined
      }
    >
      {duplicate ? (
        <Box sx={{ px: 2.5, pt: 1, pb: 2.5 }}>
          <AlreadyInRecipes ref={duplicateHeading} />
        </Box>
      ) : (
        <Stack
          id={formId}
          component="form"
          spacing={2}
          noValidate
          onSubmit={submit}
          aria-label={t('fromLink.heading')}
          sx={{ px: 2.5, pt: 1, pb: 2.5 }}
        >
          <Typography color="text.secondary">{t('fromLink.hint')}</Typography>
          {full ? (
            <Alert>
              {t('fromLink.full', { count: MAX_HELD_RECIPE_READS })}
            </Alert>
          ) : null}
          <Box>
            <Typography
              component="label"
              htmlFor={fieldId}
              variant="sectionLabel"
              color="text.secondary"
              sx={{ display: 'block', mb: '6px' }}
            >
              {t('fromLink.label')}
            </Typography>
            <TextField
              id={fieldId}
              type="url"
              value={url}
              onChange={(event) => {
                setFull(false);
                setUrl(event.target.value);
              }}
              sx={fieldSx}
              slotProps={{
                htmlInput: {
                  maxLength: MAX_LINK_LENGTH,
                  inputMode: 'url',
                  autoCapitalize: 'none',
                  autoCorrect: 'off',
                  spellCheck: false,
                },
              }}
            />
          </Box>
          <ReadingLanguageChoice value={language} onChange={setLanguage} />
          {linkPrice ? (
            <Typography variant="meta" color="text.secondary">
              <Trans
                t={t}
                i18nKey="fromLink.priceLink"
                components={{ price: <CreditPrice kind="link-page" /> }}
              />
            </Typography>
          ) : null}
        </Stack>
      )}
    </Sheet>
  );
}

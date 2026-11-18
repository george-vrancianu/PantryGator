import {
  Box,
  Button,
  Stack,
  Typography,
  tokens,
  radius,
} from '@pocket-pantry/ui';
import { useToast } from '@pocket-pantry/ui';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import { ApiError } from '@/lib/api';
import { capMessage } from '@/lib/capMessage';
import type { GuidanceInput } from '@/lib/adminRecipes';
import type { GuidanceDraft } from '@/lib/guidanceDraft';
import {
  fillableFields,
  guidanceForRequest,
  mergeSuggestion,
  type GuidanceField,
  type GuidanceSuggestion,
} from '@/lib/guidanceSuggestion';

/** The AI failures arrive as Scan codes whose copy talks about photos; this feature words them itself. */
const SUGGEST_ERRORS: Record<string, string> = {
  'scan.provider_unavailable': 'errors:guidance.suggest_unavailable',
  'scan.not_configured': 'errors:guidance.suggest_unavailable',
  'scan.provider_refused': 'errors:guidance.suggest_failed',
  'scan.provider_incomplete': 'errors:guidance.suggest_failed',
  'scan.result_invalid': 'errors:guidance.suggest_failed',
};

/** What `GuidanceFields` needs from `useGuidanceSuggestion` to show the button, the marks and the messages. */
export type GuidanceSuggestionControl = {
  suggest: () => void;
  working: boolean;
  /** Every field Suggest Guidance covers is filled. */
  allFilled: boolean;
  /** Fields the last answer had nothing for (cleared as soon as the Member fills them). */
  noSuggestions: GuidanceField[];
  /** The fields the last answer filled, for the announcement. */
  filled: GuidanceField[];
};

type Options = {
  draft: GuidanceDraft;
  onChange: (draft: GuidanceDraft) => void;
  /**
   * Each host supplies its endpoint: given all the Guidance on the form, it builds its
   * request (from whatever else its page holds) and calls it.
   */
  send: (guidance: GuidanceInput) => Promise<GuidanceSuggestion>;
};

/**
 * Suggest Guidance for a Guidance draft, shared by the Family and Admin editors: one request
 * at a time, merged only into the fields still empty when the answer arrives, nothing stored.
 * A failure leaves the form as it was and says so in a polite toast.
 */
export function useGuidanceSuggestion({
  draft,
  onChange,
  send,
}: Options): GuidanceSuggestionControl {
  const { t, i18n } = useTranslation(['admin', 'errors']);
  const toast = useToast();
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<{
    noSuggestions: GuidanceField[];
    filled: GuidanceField[];
  }>({ noSuggestions: [], filled: [] });
  // The form as it is when the answer arrives, not as it was when the button was pressed.
  const latest = useRef({ draft, onChange });
  useEffect(() => {
    latest.current = { draft, onChange };
  });
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const suggest = () => {
    // A second press before the state has rendered is still one request.
    if (busy.current || fillableFields(draft).length === 0) return;
    busy.current = true;
    setWorking(true);
    setResult({ noSuggestions: [], filled: [] });
    void send(guidanceForRequest(draft))
      .then((suggestion) => {
        if (!mounted.current) return;
        const merged = mergeSuggestion(latest.current.draft, suggestion);
        if (merged.filled.length > 0) latest.current.onChange(merged.draft);
        setResult({
          noSuggestions: suggestion.noSuggestions,
          filled: merged.filled,
        });
      })
      .catch((error: unknown) => {
        if (!mounted.current) return;
        if (
          error instanceof ApiError &&
          error.code === 'guidance.cap_reached'
        ) {
          toast.show(
            capMessage(t, i18n.language, error.params, 'errors:guidance'),
            {
              polite: true,
            },
          );
          return;
        }
        const key =
          error instanceof ApiError ? SUGGEST_ERRORS[error.code] : undefined;
        toast.show(key ? t(key) : translateApiError(t, error), {
          polite: true,
        });
      })
      .finally(() => {
        busy.current = false;
        if (mounted.current) setWorking(false);
      });
  };

  return {
    suggest,
    working,
    allFilled: fillableFields(draft).length === 0,
    // A field the Member has since filled no longer needs its message.
    noSuggestions: result.noSuggestions.filter((field) =>
      fillableFields(draft).includes(field),
    ),
    filled: result.filled,
  };
}

/** The "Suggested" mark: a field or item proposed by Suggest Guidance and not edited since. */
export function SuggestedMark() {
  const { t } = useTranslation('admin');
  return (
    <Box
      component="span"
      sx={{
        ml: 1,
        fontSize: 12,
        fontWeight: 700,
        px: '10px',
        py: '2px',
        borderRadius: radius.tag,
        bgcolor: tokens.color.okBg,
        color: tokens.color.okFg,
      }}
    >
      {t('recipe.guidance.suggest.mark')}
    </Box>
  );
}

/** The "No suggestions for ..." message of one field, always mounted so a screen reader announces it. */
export function NoSuggestionsMessage({
  field,
  control,
}: {
  field: GuidanceField;
  control?: GuidanceSuggestionControl;
}) {
  const { t } = useTranslation('admin');
  if (!control) return null;
  return (
    <Typography role="status" variant="body2" color="text.secondary">
      {control.noSuggestions.includes(field)
        ? t('recipe.guidance.suggest.none', {
            field: t(`recipe.guidance.suggest.fields.${field}`),
          })
        : null}
    </Typography>
  );
}

/** The Suggest Guidance button, its hint when there is nothing to fill, and what the last press did. */
export function SuggestGuidanceButton({
  control,
}: {
  control: GuidanceSuggestionControl;
}) {
  const { t } = useTranslation('admin');
  const hintId = useId();
  return (
    <Stack spacing={0.5}>
      <div>
        <Button
          variant="secondary"
          disabled={control.working || control.allFilled}
          aria-describedby={control.allFilled ? hintId : undefined}
          onClick={control.suggest}
        >
          {control.working
            ? t('recipe.guidance.suggest.working')
            : t('recipe.guidance.suggest.button')}
        </Button>
      </div>
      {control.allFilled ? (
        <Typography id={hintId} variant="body2" color="text.secondary">
          {t('recipe.guidance.suggest.allFilled')}
        </Typography>
      ) : null}
      <Typography role="status" variant="body2" color="text.secondary">
        {control.filled.length > 0
          ? t('recipe.guidance.suggest.added', {
              fields: control.filled
                .map((field) => t(`recipe.guidance.suggest.fields.${field}`))
                .join(', '),
            })
          : null}
      </Typography>
    </Stack>
  );
}

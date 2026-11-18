import {
  Alert,
  Box,
  Sheet,
  type SheetPrimary,
  type SheetSecondary,
} from '@pocket-pantry/ui';
import { useId, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';

export type ReviewSheetForm = {
  onSubmit: () => void;
  canSubmit: boolean;
  saving: boolean;
  submitLabel: string;
  savingLabel: string;
  /** The sheet's other action, e.g. Restore, left of the submit button. */
  secondary?: SheetSecondary;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onExited: () => void;
  /** The sheet's name and heading. */
  title: string;
  /** Under the title: counts, sources, the printed text. */
  subtitle?: string;
  /** A back button before the title, for a step inside the sheet. */
  onBack?: () => void;
  /** The last API error of any write in the sheet. */
  error?: unknown;
  size?: 'tall' | 'content';
  /** A form: the body submits on Enter and the pinned submit button is the sheet's primary. */
  form?: ReviewSheetForm;
  /** The primary (and secondary) when the sheet is not a form. */
  actions?: {
    primary: Extract<SheetPrimary, { onClick: () => void }>;
    secondary?: SheetSecondary;
  };
  children: ReactNode;
};

/**
 * The frame of the To review sheets: a title with a context line and an X, a scrolling body, and
 * the pinned primary ("Link 3 rows", or the sheet's own action) with an optional secondary.
 */
export function ReviewSheet({
  open,
  onClose,
  onExited,
  title,
  subtitle,
  onBack,
  error,
  size = 'tall',
  form,
  actions,
  children,
}: Props) {
  const { t } = useTranslation(['admin', 'errors']);
  const formId = useId();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    form?.onSubmit();
  };
  const body = (
    <>
      {error ? <Alert>{translateApiError(t, error)}</Alert> : null}
      {children}
    </>
  );
  const roles = form
    ? {
        primary: {
          label: form.saving ? form.savingLabel : form.submitLabel,
          pending: form.saving,
          disabled: !form.canSubmit,
          form: formId,
        },
        secondary: form.secondary,
      }
    : actions;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      onExited={onExited}
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      size={size}
      {...roles}
    >
      {form ? (
        <Box
          component="form"
          id={formId}
          onSubmit={submit}
          noValidate
          sx={{ display: 'grid', gap: 2, px: 3, pt: 1, pb: 2 }}
        >
          {body}
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gap: 2, px: 3, pt: 1, pb: 2 }}>{body}</Box>
      )}
    </Sheet>
  );
}

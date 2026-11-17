import { Alert, Button, Stack, Typography } from '@pocket-pantry/ui';
import {
  useContext,
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ConfirmAction } from './ConfirmAction';
import { translateApiError } from '../i18n/translateApiError';
import { EditorSheetContext } from './editorSheetContext';

type BaseProps = {
  heading: string;
  /** A line under the heading. */
  description?: string;
  /** The last API error of any write in the form, if any. */
  error: unknown;
  /** The words for `error` when the caller words it itself (say, with params to format). */
  errorText?: string;
  canSave: boolean;
  saving: boolean;
  onSubmit: () => void;
  /** Omit when creating: there is nothing to delete yet. */
  onDelete?: () => void;
  deleting?: boolean;
  /** Own delete step, rendered where Delete goes, when the plain two-step `onDelete` does not fit. */
  deleteSlot?: ReactNode;
  /** Replace Save / Saving… on the submit button. */
  saveLabel?: string;
  savingLabel?: string;
  children: ReactNode;
};

type Props = BaseProps &
  (
    | {
        /** The page's top bar carries Save, so the form draws no Save / Cancel row (an editor page, ADR 0042). */
        hideActions: true;
        onCancel?: never;
      }
    | { hideActions?: false; onCancel: () => void }
  );

/**
 * Shared frame of the editors (Admin and Recipes): a heading that takes focus when the
 * editor opens, the error, the fields, and Save / Cancel / two-step Delete.
 */
export function EditorForm({
  heading,
  description,
  error,
  errorText,
  canSave,
  saving,
  onSubmit,
  onCancel,
  onDelete,
  deleting,
  deleteSlot,
  saveLabel,
  savingLabel,
  hideActions,
  children,
}: Props) {
  const { t } = useTranslation(['admin', 'errors']);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formId = useId();
  // In a sheet the title names the editor and Save / Cancel sit in the sheet's pinned footer.
  const sheet = useContext(EditorSheetContext);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const setSheetTitle = sheet?.setTitle;
  useEffect(() => {
    setSheetTitle?.(heading);
  }, [setSheetTitle, heading]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  const actions = (
    <Stack direction="row" spacing={1}>
      <Button type="submit" form={formId} disabled={saving || !canSave}>
        {saving
          ? (savingLabel ?? t('admin:common.saving'))
          : (saveLabel ?? t('admin:common.save'))}
      </Button>
      <Button variant="ghost" sx={{ height: 52 }} onClick={onCancel}>
        {t('admin:common.cancel')}
      </Button>
    </Stack>
  );

  return (
    <Stack
      component="form"
      id={formId}
      spacing={2}
      onSubmit={submit}
      noValidate
    >
      {sheet ? null : (
        <Typography
          ref={headingRef}
          component="h2"
          variant="h6"
          tabIndex={-1}
          sx={{ outline: 'none' }}
        >
          {heading}
        </Typography>
      )}
      {description ? (
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      ) : null}
      {error ? <Alert>{errorText ?? translateApiError(t, error)}</Alert> : null}
      {children}
      {hideActions
        ? null
        : sheet
          ? sheet.footer
            ? createPortal(actions, sheet.footer)
            : null
          : actions}
      {onDelete ? (
        <ConfirmAction
          variant="ghost"
          label={t('admin:common.delete')}
          message={t('admin:common.deleteConfirm')}
          disabled={deleting}
          onConfirm={onDelete}
        />
      ) : (
        (deleteSlot ?? null)
      )}
    </Stack>
  );
}

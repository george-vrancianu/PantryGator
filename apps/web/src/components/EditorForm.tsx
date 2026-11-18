import { Alert, Button, Stack, Typography } from '@pocket-pantry/ui';
import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmAction, ConfirmPrompt } from './ConfirmAction';
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
  /**
   * Own delete step, when the plain two-step `onDelete` does not fit: `onDeleteRequest` is what
   * Delete does (the sheet's destructive link, or the inline button) and `deletePrompt` is the
   * step it opens, shown in the form while there is one.
   */
  onDeleteRequest?: () => void;
  deletePrompt?: ReactNode;
  /** The inline Delete button, for focus to return to after the prompt (no sheet only). */
  deleteTriggerRef?: Ref<HTMLButtonElement>;
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
  onDeleteRequest,
  deletePrompt,
  deleteTriggerRef,
  saveLabel,
  savingLabel,
  hideActions,
  children,
}: Props) {
  const { t } = useTranslation(['admin', 'errors']);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formId = useId();
  // In a sheet the title names the editor and Save / Delete are the sheet's roles.
  const sheet = useContext(EditorSheetContext);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const saveText = saving
    ? (savingLabel ?? t('admin:common.saving'))
    : (saveLabel ?? t('admin:common.save'));
  const deleteLabel = t('admin:common.delete');
  const canDelete = Boolean(onDelete ?? onDeleteRequest);
  const startDelete = () => {
    if (onDelete) setConfirmingDelete(true);
    else onDeleteRequest?.();
  };
  const startRef = useRef(startDelete);
  useEffect(() => {
    startRef.current = startDelete;
  });
  const report = sheet?.report;
  useEffect(() => {
    report?.({
      title: heading,
      ...(hideActions
        ? {}
        : {
            primary: {
              label: saveText,
              pending: saving,
              disabled: !canSave,
              form: formId,
            },
          }),
      ...(canDelete
        ? {
            destructive: {
              label: deleteLabel,
              onClick: () => startRef.current(),
            },
          }
        : {}),
    });
  }, [
    report,
    heading,
    hideActions,
    saveText,
    saving,
    canSave,
    formId,
    canDelete,
    deleteLabel,
  ]);
  useEffect(() => () => report?.(null), [report]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  const actions = (
    <Stack direction="row" spacing={1}>
      <Button type="submit" form={formId} disabled={saving || !canSave}>
        {saveText}
      </Button>
      <Button variant="ghost" sx={{ height: 52 }} onClick={onCancel}>
        {t('admin:common.cancel')}
      </Button>
    </Stack>
  );

  const renderDelete = () => {
    if (sheet) {
      if (onDelete && confirmingDelete) {
        return (
          <ConfirmPrompt
            message={t('admin:common.deleteConfirm')}
            disabled={deleting}
            onConfirm={() => {
              setConfirmingDelete(false);
              onDelete();
            }}
            onCancel={() => setConfirmingDelete(false)}
          />
        );
      }
      return deletePrompt ?? null;
    }
    if (onDelete) {
      return (
        <ConfirmAction
          variant="ghost"
          label={deleteLabel}
          message={t('admin:common.deleteConfirm')}
          disabled={deleting}
          onConfirm={onDelete}
        />
      );
    }
    if (deletePrompt) return deletePrompt;
    return onDeleteRequest ? (
      <Button
        ref={deleteTriggerRef}
        type="button"
        variant="ghost"
        disabled={deleting}
        onClick={onDeleteRequest}
      >
        {deleteLabel}
      </Button>
    ) : null;
  };

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
      {sheet || hideActions ? null : actions}
      {renderDelete()}
    </Stack>
  );
}

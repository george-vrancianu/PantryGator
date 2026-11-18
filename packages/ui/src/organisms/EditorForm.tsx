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
import { Alert } from '../atoms/Alert';
import { Button } from '../atoms/Button';
import { Box, Stack } from '../atoms/Layout';
import { Typography } from '../atoms/Typography';
import { ConfirmAction, ConfirmPrompt } from '../molecules/ConfirmAction';
import { Sheet } from '../molecules/Sheet';
import { EditorSheetContext } from './editorSheetContext';

/** The words of the form's own buttons and delete step, worded by the app (this package has no i18n). */
export type EditorFormLabels = {
  save: string;
  saving: string;
  cancel: string;
  delete: string;
  deleteConfirm: string;
  /** The Confirm and Cancel buttons of the two-step delete. */
  confirm: string;
  cancelConfirm: string;
};

type BaseProps = {
  heading: string;
  /** A line under the heading. */
  description?: string;
  /** The words for the last API error of any write in the form; none when there is no error. */
  errorMessage?: string | null;
  labels: EditorFormLabels;
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
  /**
   * Sections that belong with the editor but are not part of its form (translations, allergens,
   * retire). Rendered below the `<form>`, never inside it: in the sheet's body, or inline under it.
   */
  after?: ReactNode;
  children: ReactNode;
};

export type EditorFormProps = BaseProps &
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
 *
 * Inside an `EditorSheet` it draws a `Sheet` instead: `heading` is the title (no heading in the
 * body, no Cancel; the X closes), Save is the pinned primary and Delete the destructive link
 * (a `ConfirmPrompt` in the body for `onDelete`, or `deletePrompt` for `onDeleteRequest`).
 */
export function EditorForm({
  heading,
  description,
  errorMessage,
  labels,
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
  after,
  children,
}: EditorFormProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formId = useId();
  // In a sheet the title names the editor and Save / Delete are the Sheet's roles.
  const sheet = useContext(EditorSheetContext);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const saveText = saving
    ? (savingLabel ?? labels.saving)
    : (saveLabel ?? labels.save);
  const deleteLabel = labels.delete;
  const canDelete = Boolean(onDelete ?? onDeleteRequest);
  const startDelete = () => {
    if (confirmingDelete) return;
    if (onDelete) setConfirmingDelete(true);
    else onDeleteRequest?.();
  };
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
        {labels.cancel}
      </Button>
    </Stack>
  );

  const renderDelete = () => {
    if (sheet) {
      if (onDelete && confirmingDelete) {
        return (
          <ConfirmPrompt
            message={labels.deleteConfirm}
            labels={{ confirm: labels.confirm, cancel: labels.cancelConfirm }}
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
          message={labels.deleteConfirm}
          confirmLabels={{
            confirm: labels.confirm,
            cancel: labels.cancelConfirm,
          }}
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

  const form = (
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
      {errorMessage != null ? <Alert>{errorMessage}</Alert> : null}
      {children}
      {sheet || hideActions ? null : actions}
      {renderDelete()}
    </Stack>
  );

  if (!sheet) {
    return after ? (
      <Stack spacing={3}>
        {form}
        {after}
      </Stack>
    ) : (
      form
    );
  }
  return (
    <Sheet
      open
      onClose={sheet.onClose}
      title={heading}
      primary={
        hideActions
          ? undefined
          : {
              label: saveText,
              pending: saving,
              disabled: !canSave,
              form: formId,
            }
      }
      destructive={
        canDelete
          ? {
              label: deleteLabel,
              disabled: deleting,
              onClick: startDelete,
            }
          : undefined
      }
    >
      <Box sx={{ px: 3, pt: 1, pb: 3 }}>
        <Stack spacing={3}>
          {form}
          {after}
        </Stack>
      </Box>
    </Sheet>
  );
}

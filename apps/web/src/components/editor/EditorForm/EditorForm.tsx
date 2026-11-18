import {
  EditorForm as UiEditorForm,
  type EditorFormProps,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';

/** `Omit` that keeps each side of EditorForm's `hideActions` union. */
type OmitEach<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

type Props = OmitEach<EditorFormProps, 'errorMessage' | 'labels'> & {
  /** The last API error of any write in the form, if any. */
  error: unknown;
  /** The words for `error` when the caller words it itself (say, with params to format). */
  errorText?: string;
};

/**
 * `EditorForm` from `@pocket-pantry/ui`, with the editors' words (Admin and Recipes) and the
 * last API error translated.
 */
export function EditorForm({ error, errorText, ...props }: Props) {
  const { t } = useTranslation(['admin', 'errors', 'common']);
  return (
    <UiEditorForm
      {...props}
      errorMessage={error ? (errorText ?? translateApiError(t, error)) : null}
      labels={{
        save: t('admin:common.save'),
        saving: t('admin:common.saving'),
        cancel: t('admin:common.cancel'),
        delete: t('admin:common.delete'),
        deleteConfirm: t('admin:common.deleteConfirm'),
        confirm: t('common:confirm'),
        cancelConfirm: t('common:cancel'),
      }}
    />
  );
}

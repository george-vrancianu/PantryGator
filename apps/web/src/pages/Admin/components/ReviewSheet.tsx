import { Alert, Box, Button, Sheet } from '@pocket-pantry/ui';
import { useId, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SheetHeader } from '../../../components/SheetHeader';
import { translateApiError } from '../../../i18n/translateApiError';

export type ReviewSheetForm = {
  onSubmit: () => void;
  canSubmit: boolean;
  saving: boolean;
  submitLabel: string;
  savingLabel: string;
  /** Another footer button after Cancel, e.g. Restore. */
  extra?: ReactNode;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onExited: () => void;
  /** The sheet's name and heading. */
  title: string;
  /** Under the title: counts, sources, the printed text. */
  subtitle?: ReactNode;
  /** A back button before the title, for a step inside the sheet. */
  onBack?: () => void;
  /** The last API error of any write in the sheet. */
  error?: unknown;
  size?: 'tall' | 'content';
  /** A form: the body submits on Enter and the sticky footer has the submit button and Cancel. */
  form?: ReviewSheetForm;
  /** Sticky footer buttons when the sheet is not a form. */
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * The frame of the To review sheets: a title with a context line and a close button, a scrolling body,
 * and a sticky footer ("Link 3 rows" and Cancel, or the sheet's own actions).
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
  return (
    <Sheet
      open={open}
      onClose={onClose}
      onExited={onExited}
      label={title}
      size={size}
      header={
        <SheetHeader
          size="roomy"
          title={title}
          subtitle={subtitle}
          onBack={onBack}
          backLabel={t('admin:review.back')}
          onClose={onClose}
          closeLabel={t('admin:common.close')}
        />
      }
      footer={
        form || actions ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 1,
              px: 3,
              py: 2,
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            {form ? (
              <>
                <Button
                  type="submit"
                  form={formId}
                  disabled={form.saving || !form.canSubmit}
                >
                  {form.saving ? form.savingLabel : form.submitLabel}
                </Button>
                <Button variant="ghost" onClick={onClose} sx={{ height: 52 }}>
                  {t('admin:common.cancel')}
                </Button>
                {form.extra}
              </>
            ) : (
              actions
            )}
          </Box>
        ) : undefined
      }
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

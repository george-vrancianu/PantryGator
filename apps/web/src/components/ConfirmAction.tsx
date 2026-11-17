import { Alert, Button, Stack } from '@pocket-pantry/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  label: string;
  /** Accessible name of the trigger, when `label` alone is ambiguous (e.g. per-row buttons). */
  triggerName?: string;
  message: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  onConfirm: () => void;
};

/**
 * A destructive action behind an inline "are you sure" step. Focus moves to
 * Confirm when the prompt opens and returns to the trigger on Cancel.
 */
export function ConfirmAction({
  label,
  triggerName,
  message,
  disabled,
  variant = 'secondary',
  onConfirm,
}: Props) {
  const [asking, setAsking] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (!asking && restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [asking]);

  if (!asking) {
    return (
      <Button
        ref={triggerRef}
        variant={variant}
        disabled={disabled}
        aria-label={triggerName}
        onClick={() => setAsking(true)}
      >
        {label}
      </Button>
    );
  }
  return (
    <ConfirmPrompt
      message={message}
      disabled={disabled}
      onConfirm={() => {
        setAsking(false);
        onConfirm();
      }}
      onCancel={() => {
        restoreFocus.current = true;
        setAsking(false);
      }}
    />
  );
}

/**
 * The "are you sure" step on its own, for a destructive action started from
 * elsewhere (e.g. a menu item). Focus moves to Confirm when it appears.
 */
export function ConfirmPrompt({
  message,
  disabled,
  onConfirm,
  onCancel,
}: {
  message: string;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('common');
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => confirmRef.current?.focus(), []);
  return (
    <Stack spacing={1}>
      <Alert severity="warning">{message}</Alert>
      <Stack direction="row" spacing={1}>
        <Button ref={confirmRef} disabled={disabled} onClick={onConfirm}>
          {t('confirm')}
        </Button>
        <Button variant="ghost" sx={{ height: 52 }} onClick={onCancel}>
          {t('cancel')}
        </Button>
      </Stack>
    </Stack>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Alert } from '../atoms/Alert';
import { Button } from '../atoms/Button';
import { Stack } from '../atoms/Layout';

/** The words of the "are you sure" step, worded by the app (this package has no i18n). */
export type ConfirmLabels = { confirm: string; cancel: string };

export type ConfirmActionProps = {
  label: string;
  /** The Confirm and Cancel buttons of the step the trigger opens. */
  confirmLabels: ConfirmLabels;
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
  confirmLabels,
  triggerName,
  message,
  disabled,
  variant = 'secondary',
  onConfirm,
}: ConfirmActionProps) {
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
      labels={confirmLabels}
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

export type ConfirmPromptProps = {
  message: string;
  labels: ConfirmLabels;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The "are you sure" step on its own, for a destructive action started from
 * elsewhere (e.g. a menu item). Focus moves to Confirm when it appears.
 */
export function ConfirmPrompt({
  message,
  labels,
  disabled,
  onConfirm,
  onCancel,
}: ConfirmPromptProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => confirmRef.current?.focus(), []);
  return (
    <Stack spacing={1}>
      <Alert severity="warning">{message}</Alert>
      <Stack direction="row" spacing={1}>
        <Button ref={confirmRef} disabled={disabled} onClick={onConfirm}>
          {labels.confirm}
        </Button>
        <Button variant="ghost" sx={{ height: 52 }} onClick={onCancel}>
          {labels.cancel}
        </Button>
      </Stack>
    </Stack>
  );
}

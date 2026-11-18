import {
  ConfirmAction as UiConfirmAction,
  ConfirmPrompt as UiConfirmPrompt,
  type ConfirmActionProps,
  type ConfirmPromptProps,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

/** The shared words of the "are you sure" step: Confirm and Cancel. */
export function useConfirmLabels() {
  const { t } = useTranslation('common');
  return { confirm: t('confirm'), cancel: t('cancel') };
}

/** `ConfirmAction` from `@pocket-pantry/ui`, with the app's Confirm / Cancel words. */
export function ConfirmAction(
  props: Omit<ConfirmActionProps, 'confirmLabels'>,
) {
  return <UiConfirmAction {...props} confirmLabels={useConfirmLabels()} />;
}

/** `ConfirmPrompt` from `@pocket-pantry/ui`, with the app's Confirm / Cancel words. */
export function ConfirmPrompt(props: Omit<ConfirmPromptProps, 'labels'>) {
  return <UiConfirmPrompt {...props} labels={useConfirmLabels()} />;
}

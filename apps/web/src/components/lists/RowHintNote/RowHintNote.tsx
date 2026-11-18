import { RowHintPill } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import type { RowHint } from '@/lib/useRowHint';

/** The first-use gesture pill under a list's header; renders nothing until the hint shows. */
export function RowHintNote({
  hint,
  text,
}: {
  hint: RowHint;
  /** The pill's text, already translated; defaults to the shared swipe-and-hold hint. */
  text?: string;
}) {
  const { t } = useTranslation('common');
  if (!hint.reserve) return null;
  return (
    <RowHintPill visible={hint.visible}>{text ?? t('row.hint')}</RowHintPill>
  );
}

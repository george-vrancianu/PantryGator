import { SegmentedControl } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import type { VoiceList, VoiceReviewAction } from '@/lib/voice';
import { displayName } from '../reviewModel';

/** The Shopping List / Pantry choice for an action that came back without a list; `value` is '' until one is picked. */
export function ListPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: VoiceList | '';
  onChange: (list: VoiceList) => void;
}) {
  const { t } = useTranslation('voice');
  return (
    <SegmentedControl<VoiceList | ''>
      fullWidth
      label={label}
      value={value}
      options={[
        { value: 'shopping', label: t('review.lists.shopping') },
        { value: 'pantry', label: t('review.lists.pantry') },
      ]}
      onChange={(list) => {
        if (list) onChange(list);
      }}
    />
  );
}

/** The picker of one action row: labelled with the action's name, showing its list once one is picked. */
export function RowListPicker({
  action,
  onPick,
}: {
  action: VoiceReviewAction;
  onPick: (list: VoiceList) => void;
}) {
  const { t } = useTranslation('voice');
  return (
    <ListPicker
      label={t('review.pickList.label', { name: displayName(action) })}
      value={action.target ?? ''}
      onChange={onPick}
    />
  );
}

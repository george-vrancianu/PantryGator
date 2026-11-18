import {
  Box,
  PlusIcon,
  palette,
  radius,
  nestedRadius,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { OptionRow } from '../OptionRow/OptionRow';
import { RowTag } from '../RowTag/RowTag';

export type UseTypedRowProps = {
  id: string;
  /** The trimmed name the Member typed. */
  name: string;
  /** Keyboard-highlighted. */
  active: boolean;
  first: boolean;
  /** The host's pill for this row, if any. */
  tag?: string | null;
  onSelect: () => void;
};

/** The dashed last option "Use “…” as typed": the name is saved as an Unmatched item. */
export function UseTypedRow({
  id,
  name,
  active,
  first,
  tag = null,
  onSelect,
}: UseTypedRowProps) {
  const { t } = useTranslation('catalog');
  return (
    <OptionRow
      id={id}
      active={active}
      first={first}
      rule="dashed"
      onSelect={onSelect}
    >
      <Box
        aria-hidden="true"
        sx={{
          flexShrink: 0,
          width: 38,
          height: 38,
          display: 'grid',
          placeItems: 'center',
          borderRadius: nestedRadius(radius.control, 5),
          backgroundColor: palette('pp-chip'),
          color: palette('text-secondary'),
        }}
      >
        <PlusIcon size={20} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          sx={{
            fontSize: 15,
            fontWeight: 600,
            color: palette('pp-accentOnTint'),
          }}
        >
          {t('search.useTyped', { name })}
        </Box>
        <Box sx={{ fontSize: 13, color: palette('text-secondary') }}>
          {t('search.useTypedHint')}
        </Box>
      </Box>
      {tag ? <RowTag>{tag}</RowTag> : null}
    </OptionRow>
  );
}

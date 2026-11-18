import {
  Box,
  BookPlusIcon,
  tokens,
  radius,
  nestedRadius,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { OptionRow } from '../OptionRow/OptionRow';

export type AddToCatalogRowProps = {
  id: string;
  /** The trimmed name the Member typed. */
  name: string;
  /** Keyboard-highlighted. */
  active: boolean;
  onSelect: () => void;
};

/** The first option when nothing matches: opens the Add to your catalog popover. */
export function AddToCatalogRow({
  id,
  name,
  active,
  onSelect,
}: AddToCatalogRowProps) {
  const { color } = tokens;
  const { t } = useTranslation('catalog');
  return (
    <OptionRow
      id={id}
      active={active}
      first
      label={`${t('search.addToCatalog', { query: name })}, ${t('search.addToCatalogHint')}`}
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
          backgroundColor: color.accentTint,
          color: color.accentOnTint,
        }}
      >
        <BookPlusIcon size={20} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: 15, fontWeight: 600, color: color.accentOnTint }}>
          {t('search.addToCatalog', { query: name })}
        </Box>
        <Box sx={{ fontSize: 13, color: color.muted }}>
          {t('search.addToCatalogHint')}
        </Box>
      </Box>
    </OptionRow>
  );
}

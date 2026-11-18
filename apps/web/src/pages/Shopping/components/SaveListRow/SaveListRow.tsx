import {
  BookmarkIcon,
  Box,
  tokens,
  border,
  color,
  radius,
  focusRing,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

export type SaveListRowProps = {
  /** Items on the Shopping List. */
  count: number;
  onClick: () => void;
};

/** The dashed row under the last Aisle that opens the Save as template sheet. */
export function SaveListRow({ count, onClick }: SaveListRowProps) {
  const { t } = useTranslation('templates');
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        width: '100%',
        p: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        border: `${border.width} dashed ${color.lineStrong}`,
        borderRadius: radius.card,
        backgroundColor: 'transparent',
        color: 'inherit',
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        ...focusRing,
      }}
    >
      <Box
        aria-hidden
        sx={{
          flexShrink: 0,
          width: 36,
          height: 36,
          display: 'grid',
          placeItems: 'center',
          borderRadius: radius.control,
          backgroundColor: tokens.color.butter,
          color: tokens.color.butterInk,
        }}
      >
        <BookmarkIcon size={18} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: 15, fontWeight: 600 }}>{t('save.row')}</Box>
        <Box sx={{ fontSize: 13, color: tokens.color.muted }}>
          {t('save.rowHint', { count })}
        </Box>
      </Box>
    </Box>
  );
}

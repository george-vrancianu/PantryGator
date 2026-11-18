import {
  Box,
  visuallyHidden,
  radius,
  insetFocusRing,
  palette,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import type { CameraMode } from '@/lib/cameraMode';
import { formatShortDate } from '@/lib/dateFormat';
import { displayName, type ReviewLine, type RowStatus } from '@/lib/review';
import { SourceText } from '../SourceText/SourceText';
import { StatusIcon } from '@/components/lists/StatusIcon/StatusIcon';
import { ROW_TINT, rowGridSx, rowId, titleId } from '../layout';

type Props = {
  line: ReviewLine;
  /** Live status: drives the icon, the tint and the message. */
  status: RowStatus;
  /** The row's sheet is open. */
  open: boolean;
  mode: CameraMode;
  onOpen: () => void;
  /** From `accessibleNamesOf`: the display name, position-qualified when repeated. */
  accessibleName: string;
};

/**
 * One line of the table: a single button (name, quantity, Location, expiry)
 * that opens the line's sheet. A missing quantity shows an amber "? unit"
 * pill so it is spotted without opening the row.
 */
export function ReviewRow({
  line,
  status,
  open,
  mode,
  onOpen,
  accessibleName,
}: Props) {
  const { t } = useTranslation(['review', 'common']);
  const name = displayName(line);
  // A repeated name: assistive tech reads the qualified one, the eye sees the plain one.
  const qualified = accessibleName !== name;
  const unit = t(`common:units.${line.unit}`);
  // A row to check is tinted by its status; a sure one stays plain.
  const background =
    status !== 'ok' ? ROW_TINT[status] : palette('background-paper');
  const cell = {
    fontSize: 12,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as const;

  return (
    <Box
      component="li"
      sx={{
        borderTop: `1px solid ${palette('divider')}`,
        bgcolor: background,
      }}
    >
      <Box
        id={rowId(line.key)}
        component="button"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={onOpen}
        sx={{
          ...rowGridSx,
          width: '100%',
          minHeight: 54,
          py: '8px',
          border: 0,
          bgcolor: 'transparent',
          color: 'inherit',
          fontFamily: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
          ...insetFocusRing,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            minWidth: 0,
          }}
        >
          <StatusIcon status={status} />
          <Box sx={{ minWidth: 0 }}>
            <Box
              id={titleId(line.key)}
              aria-hidden={qualified || undefined}
              sx={{
                fontSize: 14,
                fontWeight: 700,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </Box>
            {qualified ? (
              <Box component="span" sx={visuallyHidden}>
                {accessibleName}
              </Box>
            ) : null}
            <SourceText text={line.sourceText} mode={mode} />
          </Box>
        </Box>
        {line.quantity.trim() === '' ? (
          <Box
            component="span"
            sx={{
              justifySelf: 'start',
              px: '8px',
              py: '2px',
              borderRadius: radius.tag,
              bgcolor: palette('warning-light'),
              color: palette('warning-main'),
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {`? ${unit}`}
          </Box>
        ) : (
          <Box
            component="span"
            sx={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            {`${line.quantity} ${unit}`}
          </Box>
        )}

        <Box component="span" sx={cell}>
          {t(`common:locations.${line.location}`)}
        </Box>
        <Box
          component="span"
          sx={{ ...cell, fontVariantNumeric: 'tabular-nums' }}
        >
          {formatShortDate(line.expiryDate)}
        </Box>
      </Box>
    </Box>
  );
}

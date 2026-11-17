import {
  Alert,
  Box,
  CheckCircleIcon,
  Stack,
  Typography,
  WarningIcon,
  tokens,
  visuallyHidden,
  radius,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { formatAmount } from '../../../lib/amount';
import type { PantryLine, PantryMatch } from '../../../lib/recipes';

/** Required, non-Basic lines the server would add (short or missing). */
const addable = (line: PantryLine) =>
  !line.optional && !line.pantryBasic && line.status !== 'covered';

/** The lines "Add missing" adds. The Shopping List is not stock, so lines already on it count (the server sums them). */
export function linesToAdd(match: PantryMatch | undefined): PantryLine[] {
  return (match?.lines ?? []).filter(addable);
}

const { color } = tokens;

/** The pill's colours: a Pantry Basic first, whatever its status. */
function pillTone(line: PantryLine) {
  if (line.pantryBasic) return { bg: color.okBg, fg: color.okFg, ok: true };
  if (line.status === 'covered')
    return { bg: color.accentTint, fg: color.accentOnTint, ok: true };
  if (line.status === 'short')
    return { bg: color.soonBg, fg: color.soonFg, ok: false };
  return { bg: color.urgentBg, fg: color.urgentFg, ok: false };
}

/** A line's Pantry status as a pill: icon and words, so colour is never the only cue. */
export function LineStatusPill({
  line,
  iconOnly = false,
  added = false,
}: {
  line: PantryLine;
  /** The Member added this line to the Shopping List by hand; shows the hint whatever its status. */
  added?: boolean;
  /** Collapses to the icon; the words become its accessible name. */
  iconOnly?: boolean;
}) {
  const { t, i18n } = useTranslation(['recipes', 'common']);
  const label = line.pantryBasic
    ? t('recipes:pantry.basic')
    : line.status === 'short' && line.shortfall
      ? t('recipes:pantry.short', {
          amount: formatAmount(
            line.shortfall.quantity,
            line.shortfall.unit,
            i18n.language,
            t,
          ),
        })
      : t(`recipes:pantry.${line.status}`);
  const tone = pillTone(line);
  const onList = (line.onShoppingList && line.status !== 'covered') || added;
  if (iconOnly) {
    return (
      <Box
        component="span"
        role="img"
        aria-label={
          onList ? `${label}, ${t('recipes:pantry.onListShort')}` : label
        }
        sx={{
          display: 'inline-flex',
          p: '4px',
          borderRadius: radius.tag,
          bgcolor: tone.bg,
          color: tone.fg,
        }}
      >
        {tone.ok ? (
          <CheckCircleIcon size={14} aria-hidden />
        ) : (
          <WarningIcon size={14} aria-hidden />
        )}
      </Box>
    );
  }
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        px: '9px',
        py: '4px',
        borderRadius: radius.tag,
        bgcolor: tone.bg,
        color: tone.fg,
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {tone.ok ? (
        <CheckCircleIcon size={14} aria-hidden />
      ) : (
        <WarningIcon size={14} aria-hidden />
      )}
      <span>{label}</span>
      {onList ? (
        <span>
          <span aria-hidden> · </span>
          <Box component="span" sx={visuallyHidden}>
            ,{' '}
          </Box>
          {t('recipes:pantry.onListShort')}
        </span>
      ) : null}
    </Box>
  );
}

/** "You can make this" or how many lines are left to buy. */
export function PantryHeading({ match }: { match: PantryMatch | undefined }) {
  const { t } = useTranslation('recipes');
  if (!match) return null;
  return (
    <Typography variant="sectionLabel" component="p" role="status">
      {match.canMake
        ? t('pantry.canMake')
        : t('pantry.toBuy', { count: match.shortOrMissingCount })}
    </Typography>
  );
}

/** What goes with the header's "Add missing" button, under the ingredient list: a note when some lines are already on the Shopping List, and why the last add failed. */
export function AddMissingNotes({
  match,
  error,
}: {
  match: PantryMatch | undefined;
  /** Why the last add failed. */
  error: string | null;
}) {
  const { t } = useTranslation('recipes');
  const showNote = linesToAdd(match).some((line) => line.onShoppingList);
  if (!showNote && !error) return null;
  return (
    <Stack spacing={1}>
      {showNote ? (
        <Typography variant="meta" color="text.secondary">
          {t('pantry.someOnList')}
        </Typography>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
    </Stack>
  );
}

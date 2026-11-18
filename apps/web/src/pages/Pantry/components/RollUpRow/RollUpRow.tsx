import {
  Box,
  ChevronDownIcon,
  SwipeToggle,
  type SwipeSweep,
  Typography,
  insetFocusRing,
  palette,
  radius,
} from '@pocket-pantry/ui';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { IngredientIconSlot } from '@/components/catalog/IngredientIconSlot/IngredientIconSlot';
import { RunningLowChip } from '@/components/pantry/RunningLowChip/RunningLowChip';
import { ExpiryTag } from '@/components/pantry/ExpiryTag/ExpiryTag';
import { useExpiryTags, type Batch } from '@/lib/pantry';
import type { PantryRowHint } from '../../hooks/usePantryRowHint';
import type { PantryRow } from '../../hooks/usePantryScreen';
import { formatAmount } from '@/lib/amount';
import { useOpenIntoView } from '../../hooks/useOpenIntoView';
import { BatchDetail } from '../BatchDetail/BatchDetail';
import { IngredientActions } from '../IngredientActions/IngredientActions';
import { useRunningLowToggle } from '../../hooks/useRunningLowToggle';
import { usePantryStaple } from '../../hooks/usePantryStaple';
import { RowFlash, flashHost } from '@/components/lists/RowFlash/RowFlash';
import { rowKeyHintIds } from '../RowKeyHints/RowKeyHints';

/** The row springs back before the flag flips (Pantry batches handoff, section 6). */
const FLAG_FLIP_MS = 220;

type Props = {
  rollUp: PantryRow;
  today: Date;
  /** Open this Ingredient (closing any other on the page), or close it when it is open. */
  onToggle: () => void;
  onRemoveBatch: (batch: Batch) => void;
  /** Open the Add batch form with this Ingredient (or Unmatched name) already in it. */
  onAddBatch: () => void;
  /** Called when removing or moving a Batch leaves this row with nothing, so focus can go elsewhere. */
  onRowGone: () => void;
  rowHint: PantryRowHint;
  /** The row's block in its Location card. */
  sx?: ComponentProps<typeof Box>['sx'];
};

/** One Ingredient in a Location: total quantity and soonest expiry, expanding to each Batch (with its own expiry) and the action row. */
export function RollUpRow({
  rollUp,
  today,
  onToggle,
  onRemoveBatch,
  onAddBatch,
  onRowGone,
  rowHint,
  sx,
}: Props) {
  const { t, i18n } = useTranslation('pantry');
  const expanded = rollUp.open;
  const panelId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const { tagFor } = useExpiryTags(today);
  // A row without an expiry shows no tag; only Batch detail says "No expiry".
  const tag =
    rollUp.soonestExpiry === null ? null : tagFor(rollUp.soonestExpiry);

  // Swipe (or L) on a closed, matched row toggles Running low, and S toggles Staple. Open rows leave
  // the swipe to their Batches and these to the action row's chips.
  const lowToggle = useRunningLowToggle();
  const staple = usePantryStaple(rollUp.key, rollUp.name);
  const rowActions = !expanded && !rollUp.unmatched && !rollUp.gone;
  const [popChip, setPopChip] = useState(false);
  // The tint animates only for a flip from the closed row; undo, Batch changes, the open row's chip and
  // the first load leave this unset or cleared, so they snap.
  const [sweep, setSweep] = useState<SwipeSweep | null>(null);
  // From the closed row (swipe or L) the toast offers Undo and the row's chip pops in; the open
  // card's chip does neither.
  const flipLow = ({ fromRow = true }: { fromRow?: boolean } = {}) => {
    const on = !rollUp.runningLow;
    setPopChip(on && fromRow);
    setSweep(fromRow ? { on, id: Date.now() } : null);
    lowToggle.toggle(
      { ingredientId: rollUp.key, name: rollUp.name, on },
      { undo: fromRow },
    );
  };
  // The timer reads the row as it is when it fires, not as it was at the release.
  const latestFlip = useRef(flipLow);
  useLayoutEffect(() => {
    latestFlip.current = flipLow;
  });
  const flipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(flipTimer.current), []);
  const onSwipeToggle = () => {
    // Intended: a second swipe within FLAG_FLIP_MS restarts the wait, so two quick swipes flip once.
    clearTimeout(flipTimer.current);
    flipTimer.current = setTimeout(() => latestFlip.current(), FLAG_FLIP_MS);
  };
  const onRowKeyDown = (event: KeyboardEvent) => {
    if (!rowActions || event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key === 'l') flipLow();
    else if (key === 's') staple.toggle();
    else return;
    event.preventDefault();
  };

  // Tell the first-use hint when this roll-up is showing Batch rows to swipe.
  const showingBatches = expanded && !rollUp.gone;
  const { setOpen } = rowHint;
  useEffect(() => {
    setOpen(panelId, showingBatches);
    return () => setOpen(panelId, false);
  }, [panelId, showingBatches, setOpen]);

  // The last Batch was removed: if focus was on its row it is on the list or <body> now, so place it.
  const item = useRef<HTMLLIElement>(null);
  useOpenIntoView(item, expanded && !rollUp.gone);
  const onRowGoneNow = useRef(onRowGone);
  useLayoutEffect(() => {
    onRowGoneNow.current = onRowGone;
  });
  useEffect(() => {
    if (!rollUp.gone) return;
    const active = document.activeElement;
    if (active === document.body || item.current?.contains(active)) {
      onRowGoneNow.current();
    }
    // Only when the row becomes gone, not on every render while it is.
  }, [rollUp.gone]);

  // Escape inside the open body closes it, and focus goes back to the row. A Batch row that used
  // the key (its removal confirmation) has already prevented the default.
  const closeFromInside = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    onToggle();
    toggle.current?.focus();
  };

  // Running low stands in for the whole detail line: amounts and Batches no longer matter once it is flagged.
  const detail = rollUp.runningLow
    ? null
    : [
        rollUp.totals
          .map((total) =>
            formatAmount(total.quantity, total.unit, i18n.language, t),
          )
          .join(' + ') || null,
        rollUp.batches.length > 1
          ? t('batchCount', { count: rollUp.batches.length })
          : rollUp.batches[0].productDescription,
      ]
        .filter(Boolean)
        .join(' · ');

  return (
    <Box component="li" ref={item} sx={sx}>
      <SwipeToggle
        label={t(rollUp.runningLow ? 'group.notLow' : 'group.runningLow')}
        on={rollUp.runningLow}
        sweep={sweep}
        onToggle={onSwipeToggle}
        disabled={!rowActions}
      >
        <Box
          // Awaiting its delete: nothing to expand, and nothing to focus.
          inert={rollUp.gone || undefined}
          sx={{
            ...flashHost,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            px: '12px',
            opacity: rollUp.gone ? 0.5 : 1,
          }}
        >
          <Box
            component="button"
            type="button"
            ref={toggle}
            aria-expanded={expanded}
            aria-controls={expanded && !rollUp.gone ? panelId : undefined}
            aria-describedby={
              rowActions
                ? rowKeyHintIds({
                    runningLow: rollUp.runningLow,
                    isStaple: staple.isStaple,
                  })
                : undefined
            }
            aria-keyshortcuts={rowActions ? 'L S' : undefined}
            onClick={onToggle}
            onKeyDown={onRowKeyDown}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexGrow: 1,
              minWidth: 0,
              minHeight: 60,
              p: 0,
              border: 0,
              bgcolor: 'transparent',
              color: 'inherit',
              font: 'inherit',
              textAlign: 'left',
              cursor: 'pointer',
              // Inset: the swipe wrapper clips anything outside the row.
              ...insetFocusRing,
            }}
          >
            <IngredientIconSlot
              ingredientId={rollUp.ingredientId}
              aisleId={rollUp.aisleId}
            />
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography
                component="span"
                sx={{
                  display: 'block',
                  fontSize: 15,
                  fontWeight: expanded ? 700 : 600,
                }}
              >
                {rollUp.name}
                {rollUp.unmatched ? (
                  <Box
                    component="span"
                    sx={{
                      ml: 1,
                      fontSize: 11,
                      fontWeight: 700,
                      px: '8px',
                      py: '2px',
                      borderRadius: radius.tag,
                      bgcolor: palette('warning-light'),
                      color: palette('warning-main'),
                    }}
                  >
                    {t('unmatched')}
                  </Box>
                ) : null}
              </Typography>
              {detail || rollUp.runningLow ? (
                <Typography
                  component="span"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: 12,
                    color: palette('text-secondary'),
                    mt: '2px',
                  }}
                >
                  {rollUp.runningLow ? <RunningLowChip pop={popChip} /> : null}
                  {detail}
                </Typography>
              ) : null}
            </Box>
            {tag && !expanded ? <ExpiryTag tag={tag} /> : null}
            <Box
              component="span"
              aria-hidden="true"
              data-testid="chevron"
              sx={{
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                width: 28,
                height: 28,
                borderRadius: '50%',
                bgcolor: expanded ? palette('pp-accentTint') : 'transparent',
                color: expanded
                  ? palette('pp-accentOnTint')
                  : palette('text-secondary'),
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition:
                  'transform 260ms cubic-bezier(.2,.8,.2,1), background-color 200ms, color 200ms',
                '@media (prefers-reduced-motion: reduce)': {
                  transition: 'none',
                },
              }}
            >
              <ChevronDownIcon size={18} />
            </Box>
          </Box>
          <RowFlash ids={rollUp.batches.map((batch) => batch.id)} />
        </Box>
      </SwipeToggle>
      {expanded && !rollUp.gone ? (
        <Box
          id={panelId}
          role="group"
          aria-label={t('group.label', {
            name: rollUp.name,
            count: rollUp.batches.length,
          })}
          onKeyDown={closeFromInside}
        >
          {/* The Batches, then the action row at the bottom of the card. */}
          <Box
            component="ul"
            sx={{
              m: 0,
              p: 0,
              pb: '4px',
              listStyle: 'none',
              borderTop: `1px solid ${palette('divider')}`,
            }}
          >
            {rollUp.batches.map((batch, index) => (
              <BatchDetail
                key={batch.id}
                batch={batch}
                index={index}
                peek={
                  index === 0 && rowHint.leader === panelId && rowHint.hint.peek
                }
                onLearned={rowHint.hint.onLearned}
                sameAmount={rollUp.batches.some(
                  (other) =>
                    other.id !== batch.id &&
                    other.quantity === batch.quantity &&
                    other.unit === batch.unit,
                )}
                today={today}
                onRemove={onRemoveBatch}
                onLeft={() =>
                  rollUp.batches.length > 1
                    ? toggle.current?.focus()
                    : onRowGone()
                }
              />
            ))}
          </Box>
          <IngredientActions
            name={rollUp.name}
            unmatched={rollUp.unmatched}
            staple={staple}
            runningLow={rollUp.runningLow}
            onToggleLow={() => flipLow({ fromRow: false })}
            onAddBatch={onAddBatch}
          />
        </Box>
      ) : null}
    </Box>
  );
}

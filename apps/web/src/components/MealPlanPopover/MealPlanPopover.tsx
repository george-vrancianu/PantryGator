import {
  aisleTint,
  BackIcon,
  Button,
  CalendarIcon,
  Box,
  ChevronRightIcon,
  CloseIcon,
  displayType,
  dockBottomPx,
  DOCK_HEIGHT,
  DOCK_OVERHANG,
  focusRing,
  IconButton,
  PlusIcon,
  radius,
  readSafeInsets,
  type SafeInsets,
  shadow,
  border,
  Tag,
  tokens,
  usePrefersReducedMotion,
  useBreakpointUp,
} from '@pocket-pantry/ui';
import { AllergenIndicator } from '../AllergenIndicator';
import { placeVertically } from './verticalPlacement';
import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { keyframesSx } from '../../lib/keyframesSx';
import {
  dayMissing,
  slotsInOrder,
  type AddMissingScope,
  type PlanIssue,
  type WindowDay,
  type WindowSlot,
} from '../../lib/mealPlan';
import type { IsoDate } from '../../lib/pantry';
import {
  dayTitle,
  fullDate,
  issueDetail,
  longWeekday,
  reasonText,
} from './mealPlanText';
import { statusMark } from './statusMark';
import { plainAction } from './plainAction';

/** Widest the popover grows, px. */
const MAX_WIDTH = 340;
/** Gap between the column and the popover, px. */
const GAP = 10;
/** Closest the popover comes to the screen's side edges, px. */
const EDGE = 12;
/** Closest the arrow comes to the popover's corners, px. */
const ARROW_INSET = 18;
/** Space kept between the popover and the Dock, and between it and the top inset, px. */
const EDGE_CLEARANCE = 8;

type Position = {
  left: number;
  top: number;
  arrowX: number;
  placement: 'below' | 'above';
};

type Props = {
  days: WindowDay[];
  /** Index into `days` of the day shown. */
  index: number;
  today: IsoDate;
  /** The column the popover points at. */
  anchor: HTMLElement | null;
  /** The Widget card's width; the popover is as wide as it less 2 x EDGE, up to MAX_WIDTH. */
  measureCard: () => number | undefined;
  onStep: (index: number) => void;
  /** `returnFocus` is false when the column has scrolled away. */
  onClose: (returnFocus: boolean) => void;
  /** Elements whose taps are not "outside": the day columns, which handle their own taps. */
  isInsideTrigger: (target: Node) => boolean;
  /** Adds what is missing for a scope to the Shopping List. */
  onAdd: (scope: AddMissingScope) => void;
  /** True while an add is in flight; the add buttons wait. */
  adding: boolean;
};

const ghostButton = {
  all: 'unset',
  boxSizing: 'border-box',
  width: 30,
  height: 30,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  color: tokens.color.muted,
  cursor: 'pointer',
  flex: 'none',
  '&:disabled': { opacity: 0.3, cursor: 'default' },
  '&:active:not(:disabled)': { transform: 'scale(.96)' },
  ...focusRing,
} as const;

function IssueLine({
  issue,
  today,
  onAdd,
  adding,
}: {
  issue: PlanIssue;
  today: IsoDate;
  onAdd: Props['onAdd'];
  adding: boolean;
}) {
  const { t, i18n } = useTranslation('dashboard');
  const language = i18n.language;
  const uncertain = issue.kind === 'uncertain';
  const detail = issueDetail(t, language, issue);
  const reason = uncertain ? null : reasonText(t, language, issue, today);
  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minHeight: 32,
        fontSize: 13,
      }}
    >
      <Box
        component="span"
        sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
      >
        <span>
          <Box component="span" sx={{ fontWeight: 600 }}>
            {issue.name}
          </Box>
          {detail ? (
            <>
              {' · '}
              <Box
                component="span"
                sx={{
                  fontWeight: uncertain ? 400 : 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: uncertain
                    ? tokens.color.muted
                    : issue.onList
                      ? tokens.color.soonFg
                      : tokens.color.urgentFg,
                }}
              >
                {detail}
              </Box>
            </>
          ) : null}
        </span>
        {reason ? (
          <Box
            component="span"
            sx={{ fontSize: 12, color: tokens.color.muted, lineHeight: 1.3 }}
          >
            {reason}
          </Box>
        ) : null}
      </Box>
      {issue.onList ? (
        <Tag tone="soon" sx={{ py: '2px', px: '7px' }}>
          {t('mealPlan.status.onList')}
        </Tag>
      ) : !uncertain ? (
        // Deliberately adds that Ingredient's total across the window, not just this day's amount.
        <IconButton
          label={t('mealPlan.addLine', { name: issue.name })}
          tone="accentOutline"
          size={34}
          disabled={adding}
          onClick={() =>
            onAdd(
              issue.ingredientId
                ? { scope: 'ingredient', ingredientId: issue.ingredientId }
                : { scope: 'ingredient', name: issue.name },
            )
          }
        >
          <PlusIcon size={14} strokeWidth={2.6} />
        </IconButton>
      ) : null}
    </Box>
  );
}

function MealBlock({
  slot,
  today,
  onAdd,
  adding,
}: {
  slot: WindowSlot;
  today: IsoDate;
  onAdd: Props['onAdd'];
  adding: boolean;
}) {
  const { t } = useTranslation('dashboard');
  const tint = aisleTint(slot.aisle?.id);
  const initials = Array.from(slot.recipeTitle).slice(0, 2).join('');
  return (
    <Box
      component="li"
      sx={{
        py: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        '& + &': { borderTop: `1px solid ${tokens.color.divider}` },
      }}
    >
      <Box
        component="span"
        sx={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.07em',
          textTransform: 'uppercase',
          color: tokens.color.muted,
        }}
      >
        {t(`mealPlan.slot.${slot.mealtime}`)}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Box
          aria-hidden="true"
          data-tint={tint.name}
          sx={{
            width: 34,
            height: 34,
            flex: '0 0 auto',
            display: 'grid',
            placeItems: 'center',
            borderRadius: `calc(${radius.control} - 2px)`,
            ...displayType,
            fontSize: 12.5,
            fontWeight: 700,
            backgroundColor: tint.bg,
            color: tint.fg,
            opacity: slot.unavailable ? 0.6 : 1,
          }}
        >
          {initials}
        </Box>
        <Box
          component="span"
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box
            component="span"
            sx={{
              fontWeight: 600,
              fontSize: 14.5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: slot.unavailable ? tokens.color.muted : tokens.color.ink,
            }}
          >
            {slot.recipeTitle}
          </Box>
          <Box
            component="span"
            sx={{
              fontSize: 12.5,
              color: tokens.color.muted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {slot.minutes === null
              ? t('mealPlan.metaNoTime', { servings: slot.servings })
              : t('mealPlan.meta', {
                  servings: slot.servings,
                  minutes: slot.minutes,
                })}
          </Box>
        </Box>
        {statusMark(slot, t)}
      </Box>
      {slot.allergyWarning ? (
        <Box>
          <AllergenIndicator warning={slot.allergyWarning} withOwners />
        </Box>
      ) : null}
      {slot.issues.length > 0 ? (
        <Box
          component="ul"
          sx={{
            listStyle: 'none',
            m: 0,
            p: 0,
            ml: '44px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {slot.issues.map((issue) => (
            <IssueLine
              key={`${issue.ingredientId ?? issue.name}-${issue.kind}`}
              issue={issue}
              today={today}
              onAdd={onAdd}
              adding={adding}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * A day's meals in a non-modal dialog anchored under (or, near the Dock, above) its column, with ‹ › to step
 * through the planned days. "Edit day", "Plan a meal" and "Start a plan" link to the Meal Plan page.
 */
export function MealPlanPopover({
  days,
  index,
  today,
  anchor,
  measureCard,
  onStep,
  onClose,
  isInsideTrigger,
  onAdd,
  adding,
}: Props) {
  const { t, i18n } = useTranslation('dashboard');
  const language = i18n.language;
  const day = days[index];
  const titleId = useId();
  const popoverRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const reduceMotion = usePrefersReducedMotion();
  const tabletUp = useBreakpointUp('md');
  const dockHeight = tabletUp ? DOCK_HEIGHT.md : DOCK_HEIGHT.xs;
  const [position, setPosition] = useState<Position | null>(null);
  // Read once, and again after a resize or rotation: scrolling re-places the popover without probing the DOM.
  const insetsRef = useRef<SafeInsets | null>(null);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  const place = useCallback(() => {
    const popover = popoverRef.current;
    if (!popover || !anchor) return;
    const column = anchor.getBoundingClientRect();
    const cardWidth = measureCard();
    popover.style.width = `${
      cardWidth ? Math.min(MAX_WIDTH, cardWidth - 2 * EDGE) : MAX_WIDTH
    }px`;
    const viewHeight = window.innerHeight;
    const viewWidth = window.innerWidth;
    if (column.bottom < 0 || column.top > viewHeight) {
      onCloseRef.current(false);
      return;
    }
    const { width, height } = popover.getBoundingClientRect();
    const centre = column.left + column.width / 2;
    const left = Math.max(
      EDGE,
      Math.min(centre - width / 2, viewWidth - width - EDGE),
    );
    const insets = (insetsRef.current ??= readSafeInsets());
    const topLimit = insets.top + EDGE_CLEARANCE;
    const bottomLimit =
      viewHeight -
      (dockBottomPx(insets) + dockHeight + DOCK_OVERHANG + EDGE_CLEARANCE);
    const { top, placement } = placeVertically({
      columnTop: column.top,
      columnBottom: column.bottom,
      height,
      gap: GAP,
      topLimit,
      bottomLimit,
    });
    const arrowX = Math.max(
      ARROW_INSET,
      Math.min(width - ARROW_INSET, centre - left),
    );
    setPosition((previous) =>
      previous &&
      previous.left === left &&
      previous.top === top &&
      previous.arrowX === arrowX &&
      previous.placement === placement
        ? previous
        : { left, top, arrowX, placement },
    );
  }, [anchor, measureCard, dockHeight]);

  // Place before paint, and again when the day (and so the height) or the anchor changes.
  useLayoutEffect(() => {
    place();
  }, [place, index, day]);

  useLayoutEffect(() => {
    window.addEventListener('scroll', place, { capture: true, passive: true });
    const onResize = () => {
      insetsRef.current = null;
      place();
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('resize', onResize);
    };
  }, [place]);

  // Focus moves to the title when the popover opens or steps to another day.
  useLayoutEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [index]);

  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || isInsideTrigger(target)) {
        return;
      }
      onCloseRef.current(false);
      // The press then moves focus to what was tapped; the column gets it only if that left focus nowhere.
      setTimeout(() => {
        const active = document.activeElement;
        if (!active || active === document.body) {
          anchor?.focus({ preventScroll: true });
        }
      }, 0);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isInsideTrigger, anchor]);

  const slots = slotsInOrder(day);
  const hasMeals = slots.length > 0;
  const missing = dayMissing(day);
  const statusWord =
    day.status === 'covered'
      ? t('mealPlan.legend.covered')
      : day.status === 'onList'
        ? t('mealPlan.legend.onList')
        : day.status === 'short'
          ? t('mealPlan.legend.short')
          : null;
  const subtitle = [fullDate(language, day.date), hasMeals ? statusWord : null]
    .filter(Boolean)
    .join(' · ');
  const above = position?.placement === 'above';

  return createPortal(
    <Box
      ref={popoverRef}
      role="dialog"
      aria-labelledby={titleId}
      data-placement={position?.placement ?? 'below'}
      style={
        {
          left: position?.left ?? EDGE,
          top: position?.top ?? 0,
          visibility: position ? 'visible' : 'hidden',
          '--arrow-x': `${position?.arrowX ?? ARROW_INSET}px`,
        } as CSSProperties
      }
      sx={{
        position: 'fixed',
        zIndex: 1250,
        width: MAX_WIDTH,
        maxHeight: 470,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: tokens.color.surface,
        border: `${border.width} solid ${tokens.color.line}`,
        borderRadius: radius.card,
        boxShadow: shadow.float,
        color: tokens.color.ink,
        transformOrigin: above ? 'var(--arrow-x) 100%' : 'var(--arrow-x) 0',
        ...(reduceMotion
          ? {}
          : keyframesSx('ppMealPopIn', '.14s ease-out', {
              from: {
                opacity: 0,
                transform: `translateY(${above ? 4 : -4}px) scale(.98)`,
              },
              to: { opacity: 1, transform: 'none' },
            })),
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          position: 'absolute',
          width: 14,
          height: 14,
          left: 'calc(var(--arrow-x) - 7px)',
          backgroundColor: tokens.color.surface,
          borderLeft: `${border.width} solid ${tokens.color.line}`,
          borderTop: `${border.width} solid ${tokens.color.line}`,
          ...(above
            ? { bottom: -8, transform: 'rotate(225deg)' }
            : { top: -8, transform: 'rotate(45deg)' }),
        }}
      />
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          p: '12px 10px 10px 16px',
          borderBottom: `1px solid ${tokens.color.divider}`,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            component="h3"
            id={titleId}
            ref={titleRef}
            tabIndex={-1}
            sx={{
              m: 0,
              ...displayType,
              fontSize: 18,
              lineHeight: 1.15,
              '&:focus': { outline: 'none' },
            }}
          >
            {dayTitle(t, language, day.date, today)}
          </Box>
          <Box
            component="span"
            sx={{
              display: 'block',
              mt: '2px',
              fontSize: 12,
              fontWeight: 600,
              color: tokens.color.muted,
            }}
          >
            {subtitle}
          </Box>
        </Box>
        <Box
          component="button"
          type="button"
          aria-label={t('mealPlan.prevDay')}
          disabled={index === 0}
          onClick={() => onStep(index - 1)}
          sx={ghostButton}
        >
          <BackIcon size={16} strokeWidth={2.4} />
        </Box>
        <Box
          component="button"
          type="button"
          aria-label={t('mealPlan.nextDay')}
          disabled={index === days.length - 1}
          onClick={() => onStep(index + 1)}
          sx={ghostButton}
        >
          <ChevronRightIcon size={16} strokeWidth={2.4} />
        </Box>
        <Box
          component="button"
          type="button"
          aria-label={t('mealPlan.close')}
          onClick={() => onClose(true)}
          sx={ghostButton}
        >
          <CloseIcon size={16} strokeWidth={2.4} />
        </Box>
      </Box>
      <Box sx={{ overflow: 'auto', p: '4px 16px 8px' }}>
        {hasMeals ? (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {slots.map((slot) => (
              <MealBlock
                key={slot.mealtime}
                slot={slot}
                today={today}
                onAdd={onAdd}
                adding={adding}
              />
            ))}
          </Box>
        ) : (
          <Box
            sx={{
              pt: '18px',
              pb: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              alignItems: 'flex-start',
              fontSize: 13.5,
              color: tokens.color.muted,
            }}
          >
            <span>
              {t('mealPlan.nothingOn', {
                day: longWeekday(language, day.date),
              })}
            </span>
            <Box
              component={Link}
              to={
                day.planId
                  ? `/meal-plans/${day.planId}?day=${day.date}`
                  : `/meal-plans/new?start=${day.date}`
              }
              sx={plainAction}
            >
              {t(day.planId ? 'mealPlan.planMeal' : 'mealPlan.startPlan')}
            </Box>
          </Box>
        )}
      </Box>
      {hasMeals ? (
        <Box
          sx={{
            p: '10px 16px 14px',
            borderTop: `1px solid ${tokens.color.divider}`,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          {missing.length > 0 ? (
            <Button
              variant="primary"
              size="sm"
              shape="pill"
              startIcon={<PlusIcon size={14} strokeWidth={2.6} />}
              disabled={adding}
              onClick={() => onAdd({ scope: 'date', date: day.date })}
              sx={{ flexShrink: 0, minHeight: 32, height: 32, fontSize: 12.5 }}
            >
              {t('mealPlan.addNMissing', { count: missing.length })}
            </Button>
          ) : null}
          <Box
            component={Link}
            to={`/meal-plans/${day.planId ?? day.slots[0]?.planId}?day=${day.date}`}
            sx={plainAction}
          >
            <CalendarIcon size={14} />
            {t('mealPlan.editDay')}
          </Box>
        </Box>
      ) : null}
    </Box>,
    document.body,
  );
}

import {
  BangIcon,
  Box,
  Button,
  CalendarIcon,
  CheckIcon,
  displayType,
  focusRing,
  radius,
  PlusIcon,
  ShoppingIcon,
  Tag,
  tokens,
  color,
} from '@pocket-pantry/ui';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  BAR_FILL,
  BAR_RADIUS,
} from '../../../components/MealPlanPopover/barStyle';
import { MealPlanPopover } from '../../../components/MealPlanPopover/MealPlanPopover';
import {
  columnName,
  fullDate,
  shortWeekday,
} from '../../../components/MealPlanPopover/mealPlanText';
import { plainAction } from '../../../components/MealPlanPopover/plainAction';
import { translateApiError } from '../../../i18n/translateApiError';
import {
  barStatuses,
  dayHeadline,
  dayMark,
  useMealWindow,
  type PlanTag,
  type WindowDay,
} from '../../../lib/mealPlan';
import { planEnd } from '../../../lib/mealPlanPage';
import { fromIso, localIso, type IsoDate } from '../../../lib/pantry';
import { useAddMissing } from '../../../lib/useAddMissing';
import { useMealPlanLegend } from '../../../lib/useMealPlanLegend';
import { useToday } from '../../../lib/useToday';
import { WidgetCard } from './WidgetCard';
import type { WidgetProps } from './types';

/** The card's side padding, px; the card is this root's width plus both sides. */
const CARD_PADDING_X = 14;

/** How many missing Ingredients the footer names before "+n". */
const FOOTER_NAMES = 3;

/** The empty card's link ("Plan your week"): accent, 13/700, a 44 pt target. */
const emptyAction = {
  ...plainAction,
  minHeight: 44,
  fontSize: 13,
  fontWeight: 700,
  color: tokens.color.accent,
} as const;

/** Titles go under the bars when the columns are wide enough for them. */
const MAX_DAYS_WITH_TITLES = 3;

function PlanTagView({ tag }: { tag: PlanTag }) {
  const { t } = useTranslation('dashboard');
  switch (tag.kind) {
    case 'short':
      return (
        <Tag tone="urgent" icon={<BangIcon size={12} strokeWidth={3.4} />}>
          {t('mealPlan.short', { count: tag.count })}
        </Tag>
      );
    case 'coveredOnceYouShop':
      return (
        <Tag tone="soon" icon={<ShoppingIcon size={12} strokeWidth={2.4} />}>
          {t('mealPlan.coveredOnceYouShop')}
        </Tag>
      );
    case 'allCovered':
      return (
        <Tag tone="accent" icon={<CheckIcon size={12} strokeWidth={3} />}>
          {t('mealPlan.allCovered')}
        </Tag>
      );
    case 'none':
      return null;
  }
}

function DayMark({ day }: { day: WindowDay }) {
  const { kind, count } = dayMark(day);
  const base = {
    width: 16,
    height: 16,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    flex: 'none',
    fontSize: 10,
    fontWeight: 800,
    lineHeight: 1,
  } as const;
  const look =
    kind === 'covered'
      ? {
          backgroundColor: tokens.color.accentTint,
          color: tokens.color.accentOnTint,
        }
      : kind === 'short'
        ? { backgroundColor: tokens.color.urgentFg, color: color.cardBg }
        : kind === 'onList'
          ? {
              backgroundColor: tokens.color.soonBg,
              color: tokens.color.soonFg,
            }
          : { boxShadow: `inset 0 0 0 1.5px ${color.lineStrong}` };
  return (
    <Box aria-hidden="true" data-mark={kind} sx={{ ...base, ...look }}>
      {kind === 'covered' ? (
        <CheckIcon size={10} strokeWidth={3} />
      ) : kind === 'short' ? (
        count === 1 ? (
          <BangIcon size={10} strokeWidth={3.4} />
        ) : (
          count
        )
      ) : kind === 'onList' ? (
        <ShoppingIcon size={10} strokeWidth={2.4} />
      ) : null}
    </Box>
  );
}

function LegendSwatch({ fill }: { fill: object }) {
  return (
    <Box
      component="i"
      sx={{
        width: 14,
        height: 7,
        borderRadius: BAR_RADIUS,
        display: 'inline-block',
        ...fill,
      }}
    />
  );
}

/** The Family's plan for the next days: a column per planned day, three bars each, and a popover per day. */
export function MealPlanWidget({ columns }: WidgetProps) {
  const { t, i18n } = useTranslation('dashboard');
  const language = i18n.language;
  const todayIso = localIso(useToday());
  const mealWindow = useMealWindow(todayIso);
  const legend = useMealPlanLegend();
  const addMissing = useAddMissing(todayIso);
  // Keyed by date, not column, so a refetch that shifts the window keeps the same day open.
  const [openDate, setOpenDate] = useState<IsoDate | null>(null);
  const columnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const openIndexRef = useRef(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const measureCard = useCallback(() => {
    const width = rootRef.current?.getBoundingClientRect().width;
    return width ? width + 2 * CARD_PADDING_X : undefined;
  }, []);

  const close = useCallback((returnFocus: boolean) => {
    const index = openIndexRef.current;
    setOpenDate(null);
    if (returnFocus && index >= 0) {
      columnRefs.current[index]?.focus({ preventScroll: true });
    }
  }, []);

  const isInsideColumn = useCallback(
    (target: Node) =>
      columnRefs.current.some((column) => column?.contains(target)),
    [],
  );

  const view = mealWindow.data;
  const coversToday =
    !!view?.plan &&
    view.plan.startDate <= todayIso &&
    planEnd(view.plan) >= todayIso;
  const days = useMemo(() => view?.days ?? [], [view]);
  const planned = days.length > 0;
  // A date no longer in the window shows nothing; the effect below then forgets it.
  const open =
    openDate === null ? -1 : days.findIndex((d) => d.date === openDate);
  useLayoutEffect(() => {
    openIndexRef.current = open;
  });
  const openDay = open >= 0 ? days[open] : undefined;

  useEffect(() => {
    if (openDate === null || !view || open >= 0) return;
    // oxlint-disable-next-line react/set-state-in-effect -- forgets a date that left the window and hands focus on; the window arrives from the server
    setOpenDate(null);
    // The popover is gone with focus inside it, so focus fell to the page: give it to the nearest column.
    const active = document.activeElement;
    if (days.length > 0 && (!active || active === document.body)) {
      const gone = fromIso(openDate).getTime();
      let nearest = 0;
      days.forEach((d, i) => {
        const gap = Math.abs(fromIso(d.date).getTime() - gone);
        if (gap < Math.abs(fromIso(days[nearest].date).getTime() - gone)) {
          nearest = i;
        }
      });
      columnRefs.current[nearest]?.focus({ preventScroll: true });
    }
  }, [openDate, view, open, days]);

  const toggle = (index: number) => {
    if (open === index) {
      close(true);
      return;
    }
    legend.markSeen();
    setOpenDate(days[index].date);
  };

  return (
    <WidgetCard
      label={t('widgets.mealPlan.title')}
      size="wide"
      columns={columns}
      isLoading={mealWindow.isPending}
      error={mealWindow.error ? translateApiError(t, mealWindow.error) : null}
      padding={`12px ${CARD_PADDING_X}px 14px`}
    >
      <Box
        ref={rootRef}
        sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            minHeight: 22,
          }}
        >
          <Box
            component={Link}
            to={view?.plan ? `/meal-plans/${view.plan.id}` : '/meal-plans'}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              minWidth: 0,
              textDecoration: 'none',
              fontSize: 11,
              lineHeight: 1,
              fontWeight: 700,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: tokens.color.muted,
              whiteSpace: 'nowrap',
            }}
          >
            <CalendarIcon size={14} />
            {planned
              ? t('mealPlan.title', { count: days.length })
              : t('mealPlan.titleEmpty')}
          </Box>
          {view ? <PlanTagView tag={view.tag} /> : null}
        </Box>

        {planned ? (
          <>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
                gap: '4px',
              }}
            >
              {days.map((day, index) => {
                const isToday = day.date === todayIso;
                const isOpen = open === index;
                const headline =
                  days.length <= MAX_DAYS_WITH_TITLES
                    ? dayHeadline(day)
                    : undefined;
                return (
                  <Box
                    key={day.date}
                    component="button"
                    type="button"
                    ref={(element: HTMLButtonElement | null) => {
                      columnRefs.current[index] = element;
                    }}
                    aria-haspopup="dialog"
                    aria-expanded={isOpen}
                    aria-current={isToday ? 'date' : undefined}
                    aria-label={columnName(t, language, day)}
                    onClick={() => toggle(index)}
                    sx={{
                      all: 'unset',
                      boxSizing: 'border-box',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      p: '7px 2px 8px',
                      minWidth: 0,
                      borderRadius: `calc(${radius.control} - 1px)`,
                      cursor: 'pointer',
                      transition: 'transform .08s, background-color .15s',
                      backgroundColor: isOpen
                        ? tokens.color.chipNeutral
                        : isToday
                          ? tokens.color.accentTint
                          : 'transparent',
                      '&:hover': {
                        backgroundColor: isOpen
                          ? tokens.color.chipNeutral
                          : isToday
                            ? tokens.color.accentTint
                            : tokens.color.subtle,
                      },
                      '&:active': { transform: 'scale(.96)' },
                      '@media (prefers-reduced-motion: reduce)': {
                        transition: 'none',
                      },
                      ...focusRing,
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '.04em',
                        color: isToday
                          ? tokens.color.accentOnTint
                          : tokens.color.muted,
                      }}
                    >
                      {isToday
                        ? t('mealPlan.today')
                        : shortWeekday(language, day.date)}
                    </Box>
                    <Box
                      component="span"
                      sx={{
                        ...displayType,
                        fontSize: 17,
                        lineHeight: 1,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {Number(day.date.slice(8))}
                    </Box>
                    <Box
                      component="span"
                      aria-hidden="true"
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px',
                        width: '100%',
                        maxWidth: 30,
                      }}
                    >
                      {barStatuses(day).map((status, bar) => (
                        <Box
                          key={bar}
                          component="span"
                          data-bar={status}
                          sx={{
                            display: 'block',
                            height: 7,
                            borderRadius: BAR_RADIUS,
                            ...BAR_FILL[status],
                          }}
                        />
                      ))}
                    </Box>
                    <DayMark day={day} />
                    {days.length <= MAX_DAYS_WITH_TITLES ? (
                      <Box
                        component="span"
                        sx={{
                          fontSize: 11.5,
                          fontWeight: headline ? 600 : 500,
                          lineHeight: 1.25,
                          textAlign: 'center',
                          color: headline
                            ? tokens.color.ink
                            : tokens.color.muted,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          px: '4px',
                          minHeight: '2.5em',
                        }}
                      >
                        {headline?.recipeTitle ?? t('mealPlan.nothingYet')}
                      </Box>
                    ) : null}
                  </Box>
                );
              })}
            </Box>
            {view && view.missing.length > 0 ? (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  pt: '10px',
                  borderTop: `1px solid ${tokens.color.divider}`,
                }}
              >
                <Box
                  component="span"
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 12.5,
                    color: tokens.color.muted,
                  }}
                >
                  {t('mealPlan.missingForPlan')}{' '}
                  <Box
                    component="b"
                    sx={{ fontWeight: 700, color: tokens.color.ink }}
                  >
                    {view.missing
                      .slice(0, FOOTER_NAMES)
                      .map((item) => item.name)
                      .join(', ')}
                  </Box>
                  {view.missing.length > FOOTER_NAMES
                    ? ` ${t('mealPlan.moreMissing', {
                        count: view.missing.length - FOOTER_NAMES,
                      })}`
                    : null}
                </Box>
                <Button
                  variant="primary"
                  size="sm"
                  shape="pill"
                  startIcon={<PlusIcon size={14} strokeWidth={2.6} />}
                  disabled={addMissing.isPending}
                  onClick={() => addMissing.add({ scope: 'window' })}
                  sx={{
                    flexShrink: 0,
                    minHeight: 38,
                    height: 38,
                    fontSize: 12.5,
                  }}
                >
                  {t('mealPlan.addN', { count: view.missing.length })}
                </Button>
              </Box>
            ) : null}
            {legend.visible ? (
              <Box
                aria-hidden="true"
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '4px 12px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: tokens.color.muted,
                  '& > span': {
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  },
                }}
              >
                <span>
                  <LegendSwatch fill={BAR_FILL.covered} />
                  {t('mealPlan.legend.covered')}
                </span>
                <span>
                  <LegendSwatch fill={BAR_FILL.onList} />
                  {t('mealPlan.legend.onList')}
                </span>
                <span>
                  <LegendSwatch fill={BAR_FILL.short} />
                  {t('mealPlan.legend.short')}
                </span>
                <span>{t('mealPlan.legend.bars')}</span>
              </Box>
            ) : null}
          </>
        ) : view ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              fontSize: 15,
              fontWeight: 600,
              color: tokens.color.ink,
            }}
          >
            {view.nextPlanStart && view.nextPlanId ? (
              <Box
                component={Link}
                to={`/meal-plans/${view.nextPlanId}`}
                sx={emptyAction}
              >
                {t('mealPlan.nextPlanStarts', {
                  date: fullDate(language, view.nextPlanStart),
                })}
              </Box>
            ) : (
              <>
                <span>{t('mealPlan.nothingThisWeek')}</span>
                <Box
                  component={Link}
                  to={
                    coversToday
                      ? `/meal-plans/${view.plan?.id}`
                      : `/meal-plans/new?start=${todayIso}`
                  }
                  sx={emptyAction}
                >
                  {t('mealPlan.planWeek')}
                </Box>
              </>
            )}
          </Box>
        ) : null}
      </Box>
      {openDay ? (
        <MealPlanPopover
          days={days}
          index={open}
          today={todayIso}
          // oxlint-disable-next-line react/refs -- the popover only renders once a column is open, so its element was set in an earlier commit
          anchor={columnRefs.current[open] ?? null}
          measureCard={measureCard}
          onStep={(index) => setOpenDate(days[index].date)}
          onClose={close}
          isInsideTrigger={isInsideColumn}
          onAdd={addMissing.add}
          adding={addMissing.isPending}
        />
      ) : null}
    </WidgetCard>
  );
}

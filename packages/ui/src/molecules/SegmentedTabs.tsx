import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { useRef, type KeyboardEvent } from 'react';
import { tagColours, type TagTone } from '../atoms/Tag';
import { canopyFocusRing, focusRing } from '../theme/focusRing';
import {
  bodyFont,
  canopy,
  nestedRadius,
  palette,
  radius,
  shadow,
} from '../theme/themeVars';
import { visuallyHidden } from '../theme/visuallyHidden';

export type SegmentedTab<T extends string> = {
  value: T;
  label: string;
  /** A small badge inside the tab, e.g. "2". */
  badge?: string;
  /** `accent` for a count (the default), `urgent` for a "!" that needs attention. */
  badgeTone?: Extract<TagTone, 'accent' | 'urgent'>;
  /** What screen readers hear in place of the badge, e.g. "2 to buy". */
  badgeLabel?: string;
  /** The tab's whole accessible name, when label plus badge should read differently, e.g. "Ingredients, 6". */
  accessibleName?: string;
};

export type SegmentedTabsProps<T extends string> = {
  /** Accessible name of the tab list. */
  label: string;
  /** Prefix for the tab and panel ids; use a unique one per tab set (e.g. from `useId`). */
  id: string;
  tabs: SegmentedTab<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * On the Canopy header (Canopy handoff 4.3): a 44 high recessed track, the selected segment a
   * raised 34 high cream tile; every segment is a full-height 44 pt target.
   */
  onCanopy?: boolean;
};

/** The id of a tab's button; give the panel `aria-labelledby` of it. */
export const segmentedTabId = (id: string, value: string) =>
  `${id}-tab-${value}`;

/** The id of a tab's panel; the selected tab points at it with `aria-controls` (only that panel is rendered). */
export const segmentedTabPanelId = (id: string, value: string) =>
  `${id}-panel-${value}`;

/** Equal-width tabs in a segmented-control track. Arrow keys move and select, wrapping round. */
export function SegmentedTabs<T extends string>({
  label,
  id,
  tabs,
  value,
  onChange,
  onCanopy = false,
}: SegmentedTabsProps<T>) {
  const buttons = useRef(new Map<string, HTMLElement>());

  const select = (index: number) => {
    const target = tabs[(index + tabs.length) % tabs.length]!;
    onChange(target.value);
    buttons.current.get(target.value)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const moves: Record<string, number | undefined> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next);
  };

  return (
    <Box
      role="tablist"
      aria-label={label}
      sx={
        onCanopy
          ? {
              display: 'grid',
              gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
              gap: '2px',
              height: 44,
              boxSizing: 'border-box',
              px: '4px',
              backgroundColor: canopy.field,
              border: `1px solid ${canopy.fieldLine}`,
              boxShadow: canopy.fieldShadow,
              borderRadius: radius.btn,
            }
          : {
              display: 'grid',
              gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
              gap: '4px',
              p: '4px',
              backgroundColor: palette('pp-chip'),
              borderRadius: radius.control,
            }
      }
    >
      {tabs.map((tab, index) => {
        const selected = tab.value === value;
        return (
          <ButtonBase
            key={tab.value}
            ref={(node: HTMLElement | null) => {
              if (node) buttons.current.set(tab.value, node);
              else buttons.current.delete(tab.value);
            }}
            role="tab"
            aria-label={tab.accessibleName}
            id={segmentedTabId(id, tab.value)}
            aria-selected={selected}
            aria-controls={
              selected ? segmentedTabPanelId(id, tab.value) : undefined
            }
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            sx={
              onCanopy
                ? {
                    height: '100%',
                    minWidth: 0,
                    fontSize: 14,
                    fontWeight: selected ? 700 : 600,
                    fontFamily: bodyFont,
                    color: selected ? canopy.segOnInk : canopy.muted,
                    ...canopyFocusRing,
                  }
                : [
                    {
                      height: 40,
                      gap: '6px',
                      borderRadius: nestedRadius(radius.control, 4),
                      fontSize: 14,
                      fontWeight: selected ? 700 : 600,
                      fontFamily: bodyFont,
                      // Selected like the SegmentedControl: `seg-on` / `seg-on-ink`.
                      backgroundColor: selected ? 'pp.segOn' : 'transparent',
                      color: selected
                        ? 'pp.segOnInk'
                        : palette('text-secondary'),
                      boxShadow: selected ? shadow.segment : 'none',
                    },
                    focusRing,
                  ]
            }
          >
            <Box
              component="span"
              sx={
                onCanopy
                  ? {
                      width: '100%',
                      height: 34,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      borderRadius: radius.seg,
                      backgroundColor: selected ? canopy.segOn : 'transparent',
                      boxShadow: selected ? shadow.segment : 'none',
                    }
                  : { display: 'contents' }
              }
            >
              {tab.label}
              {tab.badge ? ' ' : null}
              {tab.badge ? (
                <Box
                  component="span"
                  aria-hidden={tab.badgeLabel ? true : undefined}
                  sx={[
                    {
                      fontSize: 11,
                      fontWeight: 700,
                      px: '6px',
                      py: '2px',
                      borderRadius: radius.box,
                    },
                    tagColours(tab.badgeTone ?? 'accent'),
                  ]}
                >
                  {tab.badge}
                </Box>
              ) : null}
              {tab.badge && tab.badgeLabel ? (
                <Box component="span" sx={visuallyHidden}>
                  {tab.badgeLabel}
                </Box>
              ) : null}
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

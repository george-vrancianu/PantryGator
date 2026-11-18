import { Box, ChevronRightIcon, tokens, displayType } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { RecipeTag } from '@/lib/tags';
import { RowTags } from '@/components/recipe/RowTags/RowTags';

type LayoutProps = {
  title: ReactNode;
  /** A line between the title and the meta. */
  above?: ReactNode;
  meta: string[];
  /** The Recipe's Tags: up to two chips and "+N" before the meta, which then follows after a dot. */
  tags?: RecipeTag[];
  /** Tags the active filter matched; shown first. */
  matchedTagIds?: readonly string[];
  /** Undefined leaves the time column out. */
  minutes?: number | null;
  pills?: ReactNode;
  /** Makes the row a link... */
  to?: string;
  /** ...or a button; with neither, a plain row. */
  onClick?: () => void;
  dimmed?: boolean;
  'aria-label'?: string;
  /** A control beside the row (not inside its link or button), e.g. Explore's add button. */
  trailing?: ReactNode;
  /** In a card group (Canopy handoff 7.4 and 7.6): display title 17, minutes 22 with MIN in caps, no chevron, the trailing control at the card's right edge. */
  grouped?: boolean;
};

/** The row's look, for a Recipe in a list and for a Recipe in a Meal plan's slot. */
export function RecipeRowLayout({
  title,
  above,
  meta,
  tags,
  matchedTagIds,
  minutes,
  pills,
  to,
  onClick,
  dimmed,
  'aria-label': ariaLabel,
  trailing,
  grouped = false,
}: LayoutProps) {
  const { t } = useTranslation('recipes');
  const inner = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minHeight: 66,
    boxSizing: 'border-box',
    p: grouped ? '11px 0 11px 16px' : '12px 4px',
    color: tokens.color.ink,
    textDecoration: 'none',
    opacity: dimmed ? 0.55 : 1,
    ...(to === undefined && onClick === undefined ? {} : { cursor: 'pointer' }),
    ...(trailing ? { flex: 1, minWidth: 0 } : {}),
  } as const;
  const content = (
    <>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          sx={
            grouped
              ? { ...displayType, fontSize: 17, lineHeight: 1.15 }
              : { fontSize: 15, fontWeight: 700 }
          }
        >
          {title}
        </Box>
        {above}
        {tags && tags.length > 0 ? (
          <RowTags tags={tags} matchedIds={matchedTagIds ?? []} meta={meta} />
        ) : meta.length > 0 ? (
          <Box
            sx={{
              fontSize: grouped ? 12.5 : 13,
              fontWeight: 500,
              color: tokens.color.muted,
              ...(grouped ? { mt: '7px' } : {}),
            }}
          >
            {meta.join(' · ')}
          </Box>
        ) : null}
        {pills}
      </Box>
      {minutes === undefined ? null : (
        <Box
          sx={{
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
        >
          {minutes === null ? (
            <Box
              sx={{ fontSize: 11, fontWeight: 600, color: tokens.color.muted }}
            >
              —
            </Box>
          ) : (
            <>
              <Box sx={{ ...displayType, fontSize: grouped ? 22 : 17 }}>
                {minutes}
              </Box>
              <Box
                sx={{
                  fontSize: grouped ? 10.5 : 11,
                  fontWeight: grouped ? 700 : 600,
                  color: tokens.color.muted,
                  ...(grouped
                    ? { letterSpacing: '0.08em', textTransform: 'uppercase' }
                    : {}),
                }}
              >
                {t('minutesShort')}
              </Box>
            </>
          )}
        </Box>
      )}
      {!grouped && (to !== undefined || onClick !== undefined) ? (
        <Box aria-hidden sx={{ display: 'flex', color: tokens.color.muted }}>
          <ChevronRightIcon size={16} />
        </Box>
      ) : null}
    </>
  );
  return (
    <Box
      component="li"
      sx={{
        '& + &': { borderTop: `1px solid ${tokens.color.line}` },
        ...(trailing
          ? {
              display: 'flex',
              alignItems: 'center',
              gap: grouped ? '12px' : '8px',
              ...(grouped ? { pr: '10px' } : {}),
            }
          : {}),
      }}
    >
      {to !== undefined ? (
        <Box component={Link} to={to} sx={inner}>
          {content}
        </Box>
      ) : onClick !== undefined ? (
        <Box
          component="button"
          type="button"
          aria-label={ariaLabel}
          onClick={onClick}
          sx={{
            ...inner,
            width: '100%',
            border: 0,
            bgcolor: 'transparent',
            font: 'inherit',
            textAlign: 'left',
          }}
        >
          {content}
        </Box>
      ) : (
        <Box sx={inner}>{content}</Box>
      )}
      {trailing}
    </Box>
  );
}

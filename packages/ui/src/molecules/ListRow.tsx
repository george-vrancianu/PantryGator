import type { ReactNode } from 'react';
import { Box } from '../atoms/Layout';
import { Typography } from '../atoms/Typography';
import { palette } from '../theme/themeVars';

export type ListRowProps = {
  /** Before the text: a tick, an icon tile. */
  leading?: ReactNode;
  /** The row's name; one line, ellipsised. */
  title: ReactNode;
  /** Under the title: quantity, expiry. */
  meta?: ReactNode;
  /** After the text: small tags. */
  tags?: ReactNode;
  /** At the trailing edge, outside the main area: a star, buttons or fields. */
  trailing?: ReactNode;
  /** Full-width content under the main line, e.g. a confirmation or a form. */
  below?: ReactNode;
  /** Strikes the title through and greys it, as on a checked-off row. */
  done?: boolean;
};

/**
 * The content of a list row: leading, title, meta, tags and trailing slots, min height 56, 8 vertical padding.
 * Layout only, with no list semantics: render it inside a `ListRowItem` (or a `SwipeRow`, which owns the `<li>`).
 */
export function ListRow({
  leading,
  title,
  meta,
  tags,
  trailing,
  below,
  done = false,
}: ListRowProps) {
  const main = (
    <Box
      sx={{
        flexGrow: 1,
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        py: '8px',
      }}
    >
      {leading ? <Box sx={{ flexShrink: 0 }}>{leading}</Box> : null}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography
          component="span"
          sx={{
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 15,
            fontWeight: done ? 500 : 600,
            ...(done
              ? {
                  textDecoration: 'line-through',
                  color: palette('text-secondary'),
                }
              : {}),
          }}
        >
          {title}
        </Typography>
        {meta ? (
          <Typography
            component="span"
            variant="meta"
            color="text.secondary"
            sx={{ display: 'block' }}
          >
            {meta}
          </Typography>
        ) : null}
      </Box>
      {tags ? <Box sx={{ flexShrink: 0 }}>{tags}</Box> : null}
    </Box>
  );

  return (
    <Box sx={{ minHeight: 56, boxSizing: 'border-box' }}>
      <Box sx={{ display: 'flex', alignItems: 'stretch', minHeight: 56 }}>
        {main}
        {trailing ? (
          <Box
            sx={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              py: '8px',
            }}
          >
            {trailing}
          </Box>
        ) : null}
      </Box>
      {below ? <Box sx={{ pb: '8px' }}>{below}</Box> : null}
    </Box>
  );
}

/** Style of the `<li>` that holds a `ListRow`: no bullet, a 1 px divider between rows. */
export const listRowItemSx = {
  listStyle: 'none',
  position: 'relative',
  '& + &': { borderTop: `1px solid ${palette('divider')}` },
} as const;

/** The `<li>` that holds a `ListRow` in a `<ul>`. */
export function ListRowItem({ children }: { children: ReactNode }) {
  return (
    <Box component="li" sx={listRowItemSx}>
      {children}
    </Box>
  );
}

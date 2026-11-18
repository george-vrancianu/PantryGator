import {
  Box,
  Button,
  Card,
  PlusIcon,
  radius,
  insetFocusRingStyle,
  Typography,
  SectionHeading,
  palette,
} from '@pocket-pantry/ui';
import type { ReactNode } from 'react';

/** A Catalog section page block: label row with a count, an optional hint, then the content. */
export function CatalogSection({
  id,
  title,
  count,
  hint,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Box
      component="section"
      aria-labelledby={id}
      sx={{ display: 'grid', gap: 1 }}
    >
      <SectionHeading
        id={id}
        title={title}
        scope={
          count === undefined ? undefined : (
            <Typography
              component="span"
              variant="meta"
              color="text.secondary"
              sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
            >
              {count}
            </Typography>
          )
        }
      />
      {hint ? (
        <Typography variant="meta" color="text.secondary" sx={{ px: 0.5 }}>
          {hint}
        </Typography>
      ) : null}
      {children}
    </Box>
  );
}

/** The Card every Catalog list sits in. */
export function CatalogCard({
  children,
  ordered = false,
  labelledBy,
}: {
  children: ReactNode;
  ordered?: boolean;
  labelledBy?: string;
}) {
  return (
    <Card
      component={ordered ? 'ol' : 'ul'}
      variant="list"
      aria-labelledby={labelledBy}
      sx={{ listStyle: 'none', m: 0, overflow: 'hidden' }}
    >
      {children}
    </Card>
  );
}

/** A tonal "New …" button under or beside a list. */
export function NewButton({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="tonal"
      size="sm"
      startIcon={<PlusIcon size={16} />}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}

/**
 * The row's title as a button whose hit area covers the whole row (the row's own trailing
 * controls sit above it), so a row has one tab stop for editing and its buttons stay separate.
 */
export function RowEditButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={label}
      onClick={onClick}
      sx={{
        display: 'block',
        maxWidth: '100%',
        p: 0,
        border: 0,
        background: 'none',
        font: 'inherit',
        color: 'inherit',
        textAlign: 'start',
        cursor: 'pointer',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        '&::after': { content: '""', position: 'absolute', inset: 0 },
        '&:focus-visible': { outline: 'none' },
        '&:focus-visible::after': insetFocusRingStyle,
      }}
    >
      {children}
    </Box>
  );
}

/** Keeps a row's own buttons clickable above the stretched {@link RowEditButton}. */
export function RowControls({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', pr: 1 }}>
      {children}
    </Box>
  );
}

/** The 38 pt rounded tile that leads a row. */
export function RowTile({
  children,
  background = palette('pp-chip'),
  color = palette('text-primary'),
}: {
  children: ReactNode;
  background?: string;
  /** The icon's colour; pair it with `background`. */
  color?: string;
}) {
  return (
    <Box
      aria-hidden
      sx={{
        width: 38,
        height: 38,
        display: 'grid',
        placeItems: 'center',
        borderRadius: `calc(${radius.control} - 1px)`,
        backgroundColor: background,
        color,
      }}
    >
      {children}
    </Box>
  );
}

/** A row's place in its order, 1-based. */
export function OrderNumber({ value }: { value: number }) {
  return (
    <Typography
      aria-hidden
      component="span"
      variant="meta"
      sx={{
        width: 20,
        textAlign: 'center',
        fontWeight: 700,
        color: palette('text-secondary'),
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {value}
    </Typography>
  );
}

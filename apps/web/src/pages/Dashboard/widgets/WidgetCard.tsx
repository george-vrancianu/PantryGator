import {
  Alert,
  Box,
  Card,
  Spinner,
  displayType,
  hero,
  tokens,
} from '@pocket-pantry/ui';
import type { ElementType, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { WidgetSize } from '../../../lib/dashboard';
import { widgetSpan, type GridColumns } from '../../../lib/layoutColumns';

type Props = {
  /** Accessible name of the card, also its visible title in most Widgets. */
  label: string;
  size: WidgetSize;
  /** The Dashboard grid's column count, passed down by the page. */
  columns: GridColumns;
  /** `hero` is the one dark card (the Shopping tile); gold with dark text in Dark. */
  tone?: 'surface' | 'hero';
  /** Makes the whole card a link, as the Shopping and Pantry Stock Widgets are. */
  to?: string;
  /** Shown instead of the content while the Widget's data loads. */
  isLoading?: boolean;
  /** Shown instead of the content when the Widget's data failed to load. */
  error?: string | null;
  padding?: string;
  children: ReactNode;
};

/** The shared frame of every Widget: grid span from the size, surface tone, loading and error states. */
export function WidgetCard({
  label,
  size,
  columns,
  tone = 'surface',
  to,
  isLoading = false,
  error = null,
  padding = '14px 14px 13px',
  children,
}: Props) {
  const { t } = useTranslation('dashboard');
  const span = widgetSpan(size, columns);
  const isHero = tone === 'hero';
  const linked = Boolean(to) && !isLoading && !error;
  const Component: ElementType = linked ? Link : 'section';

  return (
    <Card
      component={Component}
      {...(linked ? { to } : {})}
      aria-label={label}
      sx={{
        gridColumn: `span ${span.columns}`,
        gridRow: `span ${span.rows}`,
        display: 'flex',
        flexDirection: 'column',
        minHeight: size === 'small' ? 136 : undefined,
        boxSizing: 'border-box',
        p: padding,
        ...(isHero
          ? {
              background: hero.bg,
              borderColor: hero.line,
              boxShadow: hero.shadow,
            }
          : {}),
        color: isHero ? hero.ink : tokens.color.ink,
        textDecoration: 'none',
      }}
    >
      {isLoading ? (
        <Box sx={{ m: 'auto' }}>
          <Spinner label={t('common:loading')} />
        </Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : (
        children
      )}
    </Card>
  );
}

/** Icon and title row at the top of a Widget. */
export function WidgetTitle({
  icon,
  children,
  color = tokens.color.muted,
  component = 'div',
}: {
  icon: ReactNode;
  children: ReactNode;
  color?: string;
  /** `span` inside a button card, which may hold only phrasing content. */
  component?: 'div' | 'span';
}) {
  return (
    <Box
      component={component}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: 11,
        lineHeight: 1,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color,
      }}
    >
      {icon}
      {children}
    </Box>
  );
}

/** The big number and the line under it, as on the Pantry, Shopping and Suggestions Widgets. */
export function WidgetFigure({
  value,
  caption,
  numberColor,
}: {
  value: number;
  caption: string;
  /** Overrides the number's colour, e.g. the hero card's gold. */
  numberColor?: string;
}) {
  return (
    <>
      <Box
        component="p"
        sx={{
          m: 0,
          mt: '14px',
          ...displayType,
          fontSize: 50,
          fontWeight: 800,
          letterSpacing: '-0.045em',
          lineHeight: 0.95,
          ...(numberColor ? { color: numberColor } : {}),
        }}
      >
        {value}
      </Box>
      <Box
        component="p"
        sx={{ m: 0, mt: '6px', fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}
      >
        {caption}
      </Box>
    </>
  );
}

import {
  Box,
  radius,
  tokens,
  usePrefersReducedMotion,
} from '@pocket-pantry/ui';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { summariseStack, type StackSummary } from '../../../lib/photoStack';
import type { SessionScan } from '../../../lib/scanSession';
import { BARCODE_GLYPH } from '../../../components/camera/barcodeGlyph';
import {
  glassFocusRing,
  shade,
  translucent,
} from '../../../components/camera/glass';

const SIZE = 54;

/** The layers behind the newest card: rotation, shift and opacity (handoff 5.2). */
const LAYERS = [
  { transform: 'none', opacity: 1 },
  { transform: 'translate(3px, 0) rotate(6deg)', opacity: 0.85 },
  { transform: 'translate(-3px, 1px) rotate(-8deg)', opacity: 0.75 },
] as const;

/** "Review 3 photos and 2 barcodes, 1 still reading": the parts joined by the language's own words. */
function useStackLabel(summary: StackSummary) {
  const { t } = useTranslation('scan');
  if (summary.count === 0) return t('stack.empty');
  const photos = t('stack.photos', { count: summary.photos });
  const barcodes = t('stack.barcodes', { count: summary.barcodes });
  const items =
    summary.photos > 0 && summary.barcodes > 0
      ? t('stack.both', { photos, barcodes })
      : summary.barcodes > 0
        ? barcodes
        : photos;
  const status =
    summary.state === 'reading'
      ? t('stack.reading', { count: summary.reading })
      : summary.state === 'needsCrop'
        ? t('stack.needsCrop', { count: summary.needsCrop })
        : summary.state === 'failed'
          ? t('stack.failed', { count: summary.failed })
          : t('stack.allRead');
  return t('stack.labelWithStatus', {
    review: t('stack.label', { items }),
    status,
  });
}

function Badge({ summary }: { summary: StackSummary }) {
  const read = summary.state === 'read';
  return (
    <Box
      data-testid="stack-badge"
      data-state={summary.state}
      aria-hidden="true"
      sx={{
        position: 'absolute',
        top: -7,
        right: -9,
        minWidth: 22,
        height: 22,
        boxSizing: 'border-box',
        px: '6px',
        borderRadius: radius.control,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '3px',
        fontSize: 12,
        fontWeight: 800,
        fontVariantNumeric: 'tabular-nums',
        backgroundColor: read ? tokens.color.accent : tokens.color.soonFg,
        color: tokens.color.bg,
        boxShadow: `0 0 0 2px ${shade(90)}`,
      }}
    >
      {summary.state === 'reading' ? (
        <Box
          data-testid="stack-spinner"
          sx={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            border: `1.5px solid ${translucent(tokens.color.bg, 30)}`,
            borderTopColor: tokens.color.bg,
            animation: 'pp-stack-spin 0.8s linear infinite',
            '@keyframes pp-stack-spin': { to: { transform: 'rotate(1turn)' } },
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        />
      ) : summary.state === 'failed' ? (
        <span>!</span>
      ) : null}
      {summary.count}
    </Box>
  );
}

type Props = {
  scans: SessionScan[];
  /** Opens the Review overview; it works while reads are running. */
  onOpen: () => void;
  /** The stack's own box, where a captured photo flies to. */
  stackRef?: Ref<HTMLElement>;
};

/**
 * The photo stack left of the shutter: the last three cards of the Scan Session fanned, newest on
 * top, with a badge counting every card and showing whether they are read. A tap opens Review. With
 * no cards it is a dashed placeholder that does nothing.
 */
export function PhotoStack({ scans, onOpen, stackRef }: Props) {
  const reduced = usePrefersReducedMotion();
  const summary = summariseStack(scans);
  const label = useStackLabel(summary);
  const empty = summary.count === 0;
  return (
    <Box
      component="button"
      type="button"
      ref={stackRef}
      data-testid="photo-stack"
      aria-label={label}
      aria-disabled={empty || undefined}
      onClick={empty ? undefined : onOpen}
      sx={{
        position: 'relative',
        width: SIZE,
        height: SIZE,
        p: 0,
        border: empty ? `1.5px dashed ${translucent(tokens.color.ink, 30)}` : 0,
        borderRadius: radius.control,
        boxSizing: 'border-box',
        backgroundColor: 'transparent',
        color: tokens.color.ink,
        cursor: empty ? 'default' : 'pointer',
        '&:focus-visible': glassFocusRing,
      }}
    >
      {[...summary.top].reverse().map((scan) => {
        const depth = summary.top.indexOf(scan);
        const layer = LAYERS[depth];
        return (
          <Box
            key={scan.id}
            data-testid="stack-layer"
            aria-hidden="true"
            sx={{
              position: 'absolute',
              inset: 0,
              boxSizing: 'border-box',
              borderRadius: radius.control,
              overflow: 'hidden',
              border: `2px solid ${translucent(tokens.color.ink, 85)}`,
              backgroundColor: tokens.color.surface,
              display: 'grid',
              placeItems: 'center',
              transform: layer.transform,
              opacity: layer.opacity,
              ...(depth === 0 &&
                !reduced && {
                  animation: 'pp-stack-pop 350ms cubic-bezier(.3,1.6,.5,1)',
                  '@keyframes pp-stack-pop': {
                    from: { transform: 'scale(.6)' },
                    to: { transform: 'none' },
                  },
                }),
            }}
          >
            {scan.thumbnail ? (
              <Box
                component="img"
                src={scan.thumbnail}
                alt=""
                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  '& svg': {
                    width: '100%',
                    height: '100%',
                    stroke: 'currentColor',
                    fill: 'none',
                    strokeWidth: 2,
                    strokeLinecap: 'round',
                  },
                }}
              >
                {BARCODE_GLYPH}
              </Box>
            )}
          </Box>
        );
      })}
      {empty ? null : <Badge summary={summary} />}
    </Box>
  );
}

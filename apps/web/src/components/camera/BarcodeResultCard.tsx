import {
  Box,
  color,
  radius,
  shadow,
  palette,
  Typography,
  usePrefersReducedMotion,
} from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BarcodeLookupNotes } from '../BarcodeLookupNotes';
import type { BarcodeLookup } from '../../lib/barcode';
import { BARCODE_GLYPH } from './barcodeGlyph';
import { FEED_BOTTOM_IN_RAIL, useFeedArea } from './CameraFrame';

const INK = palette('text-primary');
const MUTED = palette('text-secondary');

const button = {
  minHeight: 42,
  border: 0,
  borderRadius: radius.control,
  font: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};

type Props = {
  code: string;
  /** Null while the lookup is out. */
  lookup: BarcodeLookup | null;
  /** The lookup failed: shown instead of the product, with Scan again, and Type it / Take a photo. */
  error?: string;
  onScanAgain: () => void;
  onUse: () => void;
  onTakePhoto: () => void;
  onTypeIt: () => void;
};

/**
 * What a read barcode shows over the camera before anything is filled: the product (with the Open
 * Food Facts credit when its data came from there) and Scan again / Use this, or, for a code
 * nobody knows yet, Take a photo / Type it. A polite live region, so the read is announced.
 */
export function BarcodeResultCard({
  code,
  lookup,
  error,
  onScanAgain,
  onUse,
  onTakePhoto,
  onTypeIt,
}: Props) {
  const { t } = useTranslation('scan');
  const reduced = usePrefersReducedMotion();
  const feed = useFeedArea();
  const found = lookup?.found ? lookup : null;
  const name = found ? (found.unmatchedName ?? found.productDescription) : '';
  const match = found?.match ?? null;
  return (
    <Box
      role="status"
      data-theme="warm"
      data-testid="barcode-card"
      sx={{
        position: 'absolute',
        left: 14,
        right: feed.right(14),
        bottom: feed.bottom(190, FEED_BOTTOM_IN_RAIL),
        p: 1.5,
        borderRadius: radius.sheet,
        backgroundColor: 'background.paper',
        color: INK,
        boxShadow: shadow.float,
        ...(!reduced && {
          animation: 'pp-card-up 280ms ease-out',
          '@keyframes pp-card-up': {
            from: { transform: 'translateY(24px)', opacity: 0 },
            to: { transform: 'none', opacity: 1 },
          },
        }),
      }}
    >
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 1.5 }}>
        <Box
          aria-hidden="true"
          sx={{
            width: 46,
            height: 46,
            flex: 'none',
            borderRadius: radius.control,
            backgroundColor: 'pp.chip',
            display: 'grid',
            placeItems: 'center',
            '& svg': {
              width: 26,
              height: 26,
              fill: 'none',
              stroke: INK,
              strokeWidth: 1.8,
            },
          }}
        >
          {BARCODE_GLYPH}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="div"
            sx={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 11,
              letterSpacing: '.06em',
              color: MUTED,
            }}
          >
            {code}
          </Typography>
          {error ? (
            <Typography component="div" sx={{ fontWeight: 700, fontSize: 14 }}>
              {error}
            </Typography>
          ) : lookup === null ? (
            <Typography
              component="div"
              sx={{ fontWeight: 700, fontSize: 15.5 }}
            >
              {t('barcode.lookingUp')}
            </Typography>
          ) : found ? (
            <>
              <Typography
                component="div"
                sx={{ fontWeight: 700, fontSize: 15.5 }}
              >
                {name}
              </Typography>
              {match ? (
                <Typography
                  component="div"
                  sx={{ fontSize: 12.5, color: MUTED }}
                >
                  {t('barcode.ingredientAisle', {
                    ingredient: match.name,
                    aisle: match.parentCategory.aisle.name,
                  })}
                </Typography>
              ) : null}
            </>
          ) : (
            <Typography
              component="div"
              sx={{ fontWeight: 700, fontSize: 15.5 }}
            >
              {t('barcode.unknown')}
            </Typography>
          )}
        </Box>
      </Box>
      {found ? (
        <Box sx={{ mb: 1, color: MUTED }}>
          <BarcodeLookupNotes
            lookup={{
              fromOpenFoodFacts: found.source === 'open_food_facts',
              missingAllergens: found.missingAllergens,
            }}
          />
        </Box>
      ) : null}
      {lookup === null && !error ? null : (
        <Box sx={{ display: 'grid', gap: 1 }}>
          {error ? (
            <CardButton onClick={onScanAgain} sx={{ width: '100%' }}>
              {t('barcode.scanAgain')}
            </CardButton>
          ) : null}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 1.3fr',
              gap: 1,
            }}
          >
            {found ? (
              <>
                <CardButton onClick={onScanAgain}>
                  {t('barcode.scanAgain')}
                </CardButton>
                <CardButton primary onClick={onUse}>
                  {t('barcode.use')}
                </CardButton>
              </>
            ) : (
              <>
                <CardButton onClick={onTypeIt}>{t('typeIt')}</CardButton>
                <CardButton primary onClick={onTakePhoto}>
                  {t('barcode.takePhoto')}
                </CardButton>
              </>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function CardButton({
  primary = false,
  onClick,
  sx,
  children,
}: {
  primary?: boolean;
  onClick: () => void;
  sx?: object;
  children: ReactNode;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        ...button,
        backgroundColor: primary ? 'pp.accent' : 'pp.chip',
        color: primary ? color.accentInk : INK,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

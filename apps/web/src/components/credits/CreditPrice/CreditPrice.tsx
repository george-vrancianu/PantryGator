import { Box, CreditIcon, visuallyHidden } from '@pocket-pantry/ui';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreditPrice, type CreditPriceKind } from '@/lib/credits';

/** "1 Credit" / "2 Credits": a Credit Price in words, for a screen reader or a caption. */
export function useCreditPriceText(kind: CreditPriceKind): string | null {
  const { t } = useTranslation('common');
  const price = useCreditPrice(kind);
  // Nothing to show while loading, and nothing for a read that costs nothing.
  return price ? t('credits.price', { count: price }) : null;
}

/**
 * The Credit Price of a kind of read where it is offered, drawn as the Credit icon and the number;
 * a screen reader hears it in words. Renders nothing until the price is known.
 */
export function CreditPrice({
  kind,
  sx,
  ...rest
}: { kind: CreditPriceKind } & Omit<ComponentProps<typeof Box>, 'children'>) {
  const { t } = useTranslation('common');
  const price = useCreditPrice(kind);
  return price ? (
    <Box
      component="span"
      sx={[
        {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.2em',
          verticalAlign: 'middle',
          fontVariantNumeric: 'tabular-nums',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...rest}
    >
      <CreditIcon size="1.1em" />
      <span aria-hidden>{price}</span>
      <Box component="span" sx={visuallyHidden}>
        {t('credits.price', { count: price })}
      </Box>
    </Box>
  ) : null;
}

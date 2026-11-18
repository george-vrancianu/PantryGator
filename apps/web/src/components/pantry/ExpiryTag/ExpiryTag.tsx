import {
  AlertIcon,
  Box,
  Tag,
  palette,
  visuallyHidden,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import type { ExpiryTagState } from '@/lib/pantry';

/** "No expiry": dashed and muted, so a missing date reads as deliberate rather than broken. */
const NO_EXPIRY = {
  bgcolor: 'transparent',
  color: palette('text-secondary'),
  outline: `1px dashed ${palette('text-secondary')}`,
  outlineOffset: '-1px',
} as const;

type Props = {
  tag: ExpiryTagState;
  /** Hide the tag from assistive tech, where the text beside it already says the same. */
  decorative?: boolean;
};

/** The days-left tag (Expired / Today / Tomorrow / N d left / N d), or a dashed "No expiry". Never a date. */
export function ExpiryTag({ tag, decorative = false }: Props) {
  const { t } = useTranslation('pantry');

  let label: string;
  // The abbreviation is for the eye; a screen reader gets the whole, pluralised words.
  let spoken: string | null = null;
  switch (tag.kind) {
    case 'none':
    case 'expired':
    case 'today':
    case 'tomorrow':
      label = t(`expiry.${tag.kind}`);
      break;
    case 'daysLeft':
      label = t('expiry.daysLeft', { count: tag.days });
      spoken = t('expiry.daysLeftLong', { count: tag.days });
      break;
    case 'days':
      label = t('expiry.days', { count: tag.days });
      spoken = t('expiry.daysLong', { count: tag.days });
  }

  return (
    <Tag
      // The tone is overridden for "No expiry"; any Tag tone will do.
      tone={tag.tone === 'none' ? 'ok' : tag.tone}
      aria-hidden={decorative ? true : undefined}
      icon={
        tag.kind === 'expired' ? (
          <AlertIcon size={12} strokeWidth={2.2} />
        ) : undefined
      }
      sx={[
        { fontVariantNumeric: 'tabular-nums' },
        tag.tone === 'none' ? NO_EXPIRY : {},
      ]}
    >
      {spoken === null ? (
        label
      ) : (
        <>
          <span aria-hidden="true">{label}</span>
          <Box component="span" sx={visuallyHidden}>
            {spoken}
          </Box>
        </>
      )}
    </Tag>
  );
}

import Box from '@mui/material/Box';
import { palette } from '../theme/themeVars';
import linkSvg from './svg/pg-read-link.svg?raw';
import photoSvg from './svg/pg-read-photo.svg?raw';
import receiptSvg from './svg/pg-read-receipt.svg?raw';

export type ReadingArtProps = {
  /** Square side in px. 44 fits the background strip; use 28 to 32 in a sheet row. */
  size?: number;
};

const DEFAULT_SIZE = 44;

/**
 * The art is decorative: the item's own text says what is being read. Drop the file's
 * `role="img"` and label so nothing announces the drawing; the wrapper is `aria-hidden`.
 */
const decorative = (svg: string) =>
  svg.replace(/\s+role="img"/, '').replace(/\s+aria-label="[^"]*"/, '');

/**
 * The files read these names with Light fallbacks; map them onto the active Theme.
 */
const artVars = {
  '--accent': palette('pp-accent'),
  '--accent-ink': palette('pp-accentInk'),
  '--surface': palette('background-paper'),
  '--ink': palette('text-primary'),
  '--muted': palette('text-secondary'),
  '--line-strong': palette('pp-lineStrong'),
  '--butter': palette('secondary-main'),
  '--pg-tomato': palette('pp-tomato'),
  '--pg-carrot': palette('pp-carrot'),
  '--pg-leaf': palette('pp-leaf'),
} as const;

function reading(svg: string) {
  const markup = decorative(svg);
  return function ReadingArt({ size = DEFAULT_SIZE }: ReadingArtProps) {
    return (
      <Box
        aria-hidden
        sx={{
          ...artVars,
          width: size,
          height: size,
          flex: 'none',
          '& svg': { width: '100%', height: '100%', display: 'block' },
        }}
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    );
  };
}

/** A recipe link being read into the open book. Loops 2.6 s; stills under reduced motion. */
export const LinkReadingArt = reading(linkSvg);
/** A receipt scanned line by line. Loops 2.6 s; stills under reduced motion. */
export const ReceiptReadingArt = reading(receiptSvg);
/** Ingredients found in a photo. Loops 3 s; stills under reduced motion. */
export const PhotoReadingArt = reading(photoSvg);

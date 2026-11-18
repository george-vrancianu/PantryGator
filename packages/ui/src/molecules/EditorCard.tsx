import { Card, type CardProps } from '../atoms/Card';
import { palette } from '../theme/themeVars';

/**
 * A hairline between the card's blocks: its direct children, and the items of a list (`<ol>`) that is
 * one of them. That list shape is part of the contract, so a list inside the card draws no dividers
 * of its own.
 */
const divided = {
  '& > * + *, & > ol > li + li': {
    borderTop: `1px solid ${palette('divider')}`,
  },
};

/**
 * The one card of a Recipe editor tab (Ingredients, Steps): no padding of its own, its blocks
 * (rows, a list, an add row) sit edge to edge, separated by hairlines. Rows set their own padding.
 */
export function EditorCard({ sx, ...props }: CardProps) {
  return (
    <Card
      variant="list"
      sx={[
        { p: 0, overflow: 'hidden' },
        divided,
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    />
  );
}

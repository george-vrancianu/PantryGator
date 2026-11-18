import { aisleTint, Box, color, radius } from '@pocket-pantry/ui';

/** A small rounded square in the Aisle's tint, which follows the Theme. */
export function AisleSwatch({
  aisleId,
  size,
}: {
  aisleId: string;
  size: number;
}) {
  const tint = aisleTint(aisleId);
  return (
    <Box
      aria-hidden="true"
      data-testid="aisle-swatch"
      data-tint={tint.name}
      sx={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: radius.box,
        backgroundColor: tint.bg,
        boxShadow: `inset 0 0 0 1px ${color.cardLine}`,
      }}
    />
  );
}

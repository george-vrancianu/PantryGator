import { Box, IngredientIcon } from '@pocket-pantry/ui';

export type IngredientIconSlotProps = {
  /** The Ingredient; omit it (an Unmatched name) for the Default Icon. */
  ingredientId?: string | null;
  aisleId?: string | null;
  /** Text colour the icon outline inherits; defaults to the surrounding text. */
  color?: string;
};

/** The fixed 38px, centred, decorative box an Ingredient Icon sits in at the start of a row. */
export function IngredientIconSlot({
  ingredientId,
  aisleId,
  color,
}: IngredientIconSlotProps) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        flexShrink: 0,
        width: 38,
        height: 38,
        display: 'grid',
        placeItems: 'center',
        ...(color ? { color } : {}),
      }}
    >
      <IngredientIcon ingredientId={ingredientId} aisleId={aisleId} />
    </Box>
  );
}

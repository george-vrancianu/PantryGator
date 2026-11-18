import {
  Box,
  IngredientIcon,
  tokens,
  focusRing,
  radius,
  shadow,
  color as themeColor,
} from '@pocket-pantry/ui';
import type { ReactNode } from 'react';

/** The line under a tile's name: a 12px decorative icon (preferred) or glyph (legacy, still used by RunningLowTiles and RecentlyStocked), then text, in the reason's colour. */
export type TileWhy = {
  glyph?: string;
  icon?: ReactNode;
  text: string;
  color: string;
};

export type IngredientTileProps = {
  ingredientId: string;
  /** Null (an Ingredient without an Aisle) gets the neutral tint. */
  aisleId: string | null;
  name: string;
  why: TileWhy;
  /** Accessible name; spells the why line out. */
  label: string;
  /** A secondary control (e.g. dismiss) at the tile's right edge, outside the select button. */
  action?: ReactNode;
  onSelect: () => void;
};

/** One empty-state tile: the Ingredient's icon in its Aisle tint, its name, and why it is offered. */
export function IngredientTile({
  ingredientId,
  aisleId,
  name,
  why,
  label,
  action,
  onSelect,
}: IngredientTileProps) {
  const { color } = tokens;
  // A 58 high card (Canopy 8.2): the select button fills it, the action sits at its right edge.
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        minWidth: 0,
        height: 58,
        boxSizing: 'border-box',
        backgroundColor: themeColor.cardBg,
        border: `1px solid ${themeColor.cardLine}`,
        borderRadius: radius.card,
        boxShadow: shadow.card,
        overflow: 'hidden',
      }}
    >
      <Box
        component="button"
        type="button"
        aria-label={label}
        onClick={onSelect}
        sx={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          p: action ? '0 0 0 12px' : '0 12px',
          textAlign: 'left',
          font: 'inherit',
          color: color.ink,
          background: 'none',
          border: 0,
          cursor: 'pointer',
          '&:hover': { backgroundColor: color.subtle },
          ...focusRing,
        }}
      >
        <Box aria-hidden="true" sx={{ flexShrink: 0, display: 'grid' }}>
          <IngredientIcon
            ingredientId={ingredientId}
            aisleId={aisleId ?? undefined}
            size={28}
          />
        </Box>
        <Box
          sx={{
            minWidth: 0,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
          }}
        >
          <Box
            sx={{
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1.1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1,
              color: why.color,
            }}
          >
            {why.icon ? (
              <Box
                component="span"
                aria-hidden="true"
                sx={{ display: 'flex', flexShrink: 0 }}
              >
                {why.icon}
              </Box>
            ) : why.glyph ? (
              <Box
                component="span"
                aria-hidden="true"
                sx={{ fontSize: 12, flexShrink: 0 }}
              >
                {why.glyph}
              </Box>
            ) : null}
            <Box
              component="span"
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {why.text}
            </Box>
          </Box>
        </Box>
      </Box>
      {action ? (
        <Box sx={{ flexShrink: 0, display: 'grid', placeItems: 'center' }}>
          {action}
        </Box>
      ) : null}
    </Box>
  );
}

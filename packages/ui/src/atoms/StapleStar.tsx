import { StarIcon } from './icons';
import { control, palette } from '../theme/themeVars';

export type StapleStarProps = {
  /** Whether the Ingredient is a Staple. */
  on: boolean;
  /** Handoff section 5 draws it at 19. */
  size?: number;
};

/** The Staple star (Canopy handoff 5): on is `star-fill` inside a `star` outline, off is an outline in `deco`. */
export function StapleStar({ on, size = 19 }: StapleStarProps) {
  return (
    <StarIcon
      size={size}
      style={{
        fill: on ? control.starFill : 'none',
        stroke: on ? palette('pp-star') : control.deco,
      }}
    />
  );
}

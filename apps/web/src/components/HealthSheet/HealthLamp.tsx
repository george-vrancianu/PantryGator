import {
  Box,
  canopy,
  displayType,
  healthLamp,
  LampExpiredIcon,
  LampFreshIcon,
  LampLowIcon,
  LampNothingNewIcon,
  LampSoonIcon,
  usePrefersReducedMotion,
} from '@pocket-pantry/ui';
import type { ComponentType } from 'react';
import {
  lightCountLabel,
  type HealthLight,
  type HealthLightId,
} from '../../lib/healthLights';

/** How long a lamp turning on or off takes to cross-fade, ms. */
export const LAMP_FADE_MS = 300;

const ICONS: Record<
  HealthLightId,
  ComponentType<{ size?: number; strokeWidth?: number }>
> = {
  expired: LampExpiredIcon,
  soon: LampSoonIcon,
  low: LampLowIcon,
  fresh: LampFreshIcon,
  nothingNew: LampNothingNewIcon,
};

const LIT_COLOUR: Record<HealthLightId, string> = {
  expired: healthLamp.expired,
  soon: healthLamp.soon,
  low: healthLamp.low,
  fresh: healthLamp.fresh,
  nothingNew: healthLamp.stale,
};

const mix = (a: string, percent: number, b = 'transparent') =>
  `color-mix(in srgb, ${a} ${percent}%, ${b})`;

/** The lamp check: an unlit lamp flashes to 85 % and fades back to 20 %, once, when the header appears. */
const checkSx = {
  animation: 'pp-lamp-check 2.4s ease-out 1',
  '@keyframes pp-lamp-check': {
    '0%': { opacity: 0.2 },
    '10%': { opacity: 0.85 },
    '42%': { opacity: 0.85 },
    '100%': { opacity: 0.2 },
  },
} as const;

type Props = {
  light: HealthLight;
  size?: number;
  /** Run the lamp check on an unlit lamp (when the Dashboard appears). */
  check?: boolean;
};

/**
 * One 40 x 40 recessed lamp. Decorative: the cluster's name says which lights are lit. Lit and unlit are two
 * layers, so a lamp turning on or off cross-fades over 300 ms (instant under reduced motion).
 */
export function HealthLamp({ light, size = 40, check = false }: Props) {
  const reduceMotion = usePrefersReducedMotion();
  const colour = LIT_COLOUR[light.id];
  const Icon = ICONS[light.id];
  const count = lightCountLabel(light);
  const fade = reduceMotion ? 'none' : `opacity ${LAMP_FADE_MS}ms ease`;
  const layer = {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 'inherit',
    transition: fade,
  } as const;

  return (
    <Box
      component="span"
      aria-hidden="true"
      data-lamp={light.id}
      data-lit={light.on ? 'true' : 'false'}
      sx={{
        position: 'relative',
        width: size,
        height: size,
        flex: 'none',
        boxSizing: 'border-box',
        display: 'block',
        borderRadius: healthLamp.radius,
        boxShadow: healthLamp.windowShadow,
        background: healthLamp.windowOff,
        border: `1px solid ${mix(canopy.ink, 9)}`,
      }}
    >
      <Box
        component="span"
        data-layer="off"
        sx={{
          ...layer,
          opacity: light.on ? 0 : 1,
          color: canopy.ink,
        }}
      >
        <Box
          component="span"
          data-check={check && !reduceMotion && !light.on ? 'true' : undefined}
          sx={{
            display: 'block',
            opacity: 0.2,
            ...(check && !reduceMotion && !light.on ? checkSx : {}),
          }}
        >
          <Icon size={22} strokeWidth={1.7} />
        </Box>
      </Box>
      <Box
        component="span"
        data-layer="on"
        sx={{
          ...layer,
          opacity: light.on ? 1 : 0,
          background: `radial-gradient(circle at 50% 45%, ${mix(colour, 24)} 0%, transparent 78%), ${healthLamp.window}`,
          border: `1px solid ${mix(colour, 42)}`,
          margin: '-1px',
          boxSizing: 'border-box',
          color: colour,
        }}
      >
        <Box
          component="span"
          sx={{
            display: 'block',
            filter: `drop-shadow(0 0 5px ${mix(colour, 75)})`,
          }}
        >
          <Icon size={22} strokeWidth={1.7} />
        </Box>
        {count ? (
          <Box
            component="span"
            data-testid={`lamp-count-${light.id}`}
            sx={{
              position: 'absolute',
              right: 3,
              bottom: 2,
              ...displayType,
              fontWeight: 800,
              fontSize: 11,
              lineHeight: 1,
            }}
          >
            {count}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

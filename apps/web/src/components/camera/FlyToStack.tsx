import { Box, radius, usePrefersReducedMotion } from '@pocket-pantry/ui';
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { frameSize } from '../../lib/cameraFrame';
import type { Rect } from '../../lib/scanGuides';
import { useCameraFrame } from './CameraFrame';

const FLY_MS = 460;

type Flight = { id: number; image: string; from: Rect };

function Flying({
  flight,
  target,
  onDone,
}: {
  flight: Flight;
  target: RefObject<HTMLElement | null>;
  onDone: (id: number) => void;
}) {
  const el = useRef<HTMLImageElement>(null);
  const frame = useCameraFrame();
  useLayoutEffect(() => {
    const bounds = target.current?.getBoundingClientRect();
    const { from } = flight;
    if (bounds && bounds.width > 0) {
      // The stack's rectangle is on the screen; the flight is drawn in the (maybe rotated-back) frame.
      const centre = frame.toFramePoint({
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      });
      const size = frameSize(bounds, frame.angle);
      const to = {
        left: centre.x - size.width / 2,
        top: centre.y - size.height / 2,
        width: size.width,
        height: size.height,
      };
      el.current?.animate?.(
        [
          { transform: 'none', borderRadius: radius.control },
          {
            transform: `translate(${to.left + to.width / 2 - (from.x + from.width / 2)}px, ${to.top + to.height / 2 - (from.y + from.height / 2)}px) scale(${to.width / from.width}, ${to.height / from.height})`,
            borderRadius: `calc(${radius.control} * ${from.width / to.width})`,
          },
        ],
        {
          duration: FLY_MS,
          easing: 'cubic-bezier(.5,0,.2,1)',
          fill: 'forwards',
        },
      );
    }
    const timer = window.setTimeout(() => onDone(flight.id), FLY_MS);
    return () => window.clearTimeout(timer);
  }, [flight, target, onDone, frame]);
  return (
    <Box
      component="img"
      ref={el}
      data-testid="scan-fly"
      src={flight.image}
      alt=""
      aria-hidden="true"
      sx={{
        position: 'absolute',
        left: flight.from.x,
        top: flight.from.y,
        width: flight.from.width,
        height: flight.from.height,
        objectFit: 'cover',
        borderRadius: radius.control,
        pointerEvents: 'none',
      }}
    />
  );
}

/**
 * A captured photo flying from the guide into the photo stack (handoff 5.3). It is decoration only:
 * the Scan has joined the Scan Session before `fly` is called, and nothing waits for the animation.
 * Under reduced motion `fly` does nothing, so no element is ever rendered.
 */
export function useFlyToStack() {
  const reduced = usePrefersReducedMotion();
  const target = useRef<HTMLElement | null>(null);
  const next = useRef(0);
  const [flights, setFlights] = useState<Flight[]>([]);
  const fly = useCallback(
    (image: string, from: Rect) => {
      if (reduced || !image) return;
      setFlights((all) => [...all, { id: next.current++, image, from }]);
    },
    [reduced],
  );
  const done = useCallback(
    (id: number) => setFlights((all) => all.filter((f) => f.id !== id)),
    [],
  );
  const layer = (
    <>
      {flights.map((flight) => (
        <Flying key={flight.id} flight={flight} target={target} onDone={done} />
      ))}
    </>
  );
  return { fly, stackRef: target, layer };
}

import { Box, canopy, mask, usePrefersReducedMotion } from '@pocket-pantry/ui';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  SHELF_SLIDE_PX,
  TEXTURES,
  textureFor,
  type TextureName,
} from './canopyTexture';
import { TRANSITION_MS } from './timing';

const MASK = mask.textureFade;
const WINDOW = mask.textureWindow;

/** True while the page is hidden: the loops pause so they do not burn battery in the background. */
function usePageHidden() {
  const [hidden, setHidden] = useState(
    () => document.visibilityState === 'hidden',
  );
  useEffect(() => {
    const update = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return hidden;
}

/**
 * The texture to draw and, for `TRANSITION_MS` after it changes, the one leaving. A change of
 * texture mid-fade drops the held one and jumps to the newest, as the page transition does.
 */
function useTextureFade(name: TextureName, hold: boolean) {
  const [state, setState] = useState<{
    name: TextureName;
    leaving: TextureName | null;
  }>({ name, leaving: null });
  let now = state;
  if (name !== state.name) {
    now = {
      name,
      leaving: hold && state.leaving === null ? state.name : null,
    };
    setState(now);
  }
  useEffect(() => {
    if (!now.leaving) return;
    const timer = setTimeout(
      () => setState((s) => ({ ...s, leaving: null })),
      TRANSITION_MS,
    );
    return () => clearTimeout(timer);
  }, [now.leaving]);
  return now;
}

/**
 * The page texture behind the Canopy header, and the glint that crosses it. Mounted once in the
 * layout: the glint is one element for the whole session, so its 10 s loop keeps going across
 * navigation; only the artwork inside it cross-fades. Given `texture`, it draws that one whatever the path.
 */
export function CanopyTexture({ texture }: { texture?: TextureName } = {}) {
  const { pathname } = useLocation();
  const reduced = usePrefersReducedMotion();
  const hidden = usePageHidden();
  // Outside the layout (the Intro) the screen names its own texture.
  const wanted = texture ?? textureFor(pathname);
  const { name, leaving } = useTextureFade(wanted, !reduced);
  const play = hidden ? 'paused' : 'running';

  const layers: Array<{
    name: TextureName;
    phase: 'leaving' | 'entering' | 'idle';
  }> = [
    ...(leaving ? [{ name: leaving, phase: 'leaving' as const }] : []),
    { name, phase: leaving ? 'entering' : 'idle' },
  ];

  const fade = (phase: string) =>
    phase === 'idle'
      ? {}
      : {
          animation: `pp-texture-${phase === 'leaving' ? 'out' : 'in'} ${TRANSITION_MS}ms linear both`,
        };

  /** The inner layer: the pantry shelves slide, unless motion is reduced. */
  const inner = (texture: TextureName) =>
    texture === 'pantry' && !reduced
      ? {
          animation: `pp-shelf-slide 70s linear infinite`,
          animationPlayState: play,
          '@keyframes pp-shelf-slide': {
            from: { transform: 'translate3d(0, 0, 0)' },
            to: { transform: `translate3d(-${SHELF_SLIDE_PX}px, 0, 0)` },
          },
        }
      : {};

  const layerSx = {
    position: 'absolute' as const,
    inset: 0,
  };
  const wideSx = {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    right: `-${SHELF_SLIDE_PX}px`,
    bottom: 0,
  };

  return (
    <Box
      data-testid="canopy-texture"
      data-texture={name}
      aria-hidden
      sx={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        WebkitMaskImage: MASK,
        maskImage: MASK,
        '@keyframes pp-texture-in': {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        '@keyframes pp-texture-out': {
          from: { opacity: 1 },
          to: { opacity: 0 },
        },
      }}
    >
      <Box sx={{ ...layerSx, opacity: 0.17 }}>
        {layers.map(({ name: n, phase }) => {
          const t = TEXTURES[n];
          return (
            <Box
              key={n}
              data-layer="base"
              data-texture={n}
              data-fade={phase}
              sx={{ ...layerSx, ...fade(phase) }}
            >
              <Box
                component="i"
                sx={{
                  ...wideSx,
                  // Quoted: a build inlines the tiles as data URIs holding `'` and `(`, which an
                  // unquoted `url()` rejects, dropping the whole declaration.
                  backgroundImage: `url("${t.tile}")`,
                  backgroundSize: `${t.width}px ${t.height}px`,
                  opacity: t.opacity,
                  ...inner(n),
                }}
              />
            </Box>
          );
        })}
      </Box>
      <Box
        data-testid="canopy-glint"
        sx={{
          ...layerSx,
          opacity: 0.5,
          WebkitMaskImage: WINDOW,
          maskImage: WINDOW,
          WebkitMaskSize: '46% 100%',
          maskSize: '46% 100%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          // The resting place, and where it stays when motion is reduced.
          WebkitMaskPosition: '62% 0',
          maskPosition: '62% 0',
          ...(reduced
            ? {}
            : {
                // Crosses in 6 s, rests 4 s; started 3 s in.
                animation: 'pp-glint 10s ease-in-out -3s infinite',
                animationPlayState: play,
                '@keyframes pp-glint': {
                  '0%': {
                    WebkitMaskPosition: '-150% 0',
                    maskPosition: '-150% 0',
                  },
                  '60%': {
                    WebkitMaskPosition: '250% 0',
                    maskPosition: '250% 0',
                  },
                  '100%': {
                    WebkitMaskPosition: '250% 0',
                    maskPosition: '250% 0',
                  },
                },
              }),
        }}
      >
        {layers.map(({ name: n, phase }) => {
          const t = TEXTURES[n];
          return (
            <Box
              key={n}
              data-layer="glint"
              data-texture={n}
              data-fade={phase}
              sx={{ ...layerSx, ...fade(phase) }}
            >
              <Box
                component="i"
                sx={{
                  ...wideSx,
                  background: canopy.texGlint,
                  WebkitMaskImage: `url("${t.glintTile}")`,
                  maskImage: `url("${t.glintTile}")`,
                  WebkitMaskSize: `${t.width}px ${t.height}px`,
                  maskSize: `${t.width}px ${t.height}px`,
                  WebkitMaskRepeat: 'repeat',
                  maskRepeat: 'repeat',
                  opacity: t.opacity,
                  ...inner(n),
                }}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

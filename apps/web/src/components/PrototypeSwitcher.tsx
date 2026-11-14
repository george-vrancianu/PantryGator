/**
 * PROTOTYPE (throwaway): the floating bar that flips between UI prototype variants via `?variant=`,
 * plus an optional second axis (here: the entry point) and a one-line state readout. Never shipped:
 * renders nothing in a production build.
 */
import { Box } from '@pocket-pantry/ui';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

type Option = { key: string; label: string };

export function PrototypeSwitcher({
  variants,
  axis,
  state,
}: {
  variants: Option[];
  axis?: { param: string; options: Option[] };
  state?: Record<string, unknown>;
}) {
  const [params, setParams] = useSearchParams();
  const current = params.get('variant') ?? variants[0].key;
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );

  const go = (step: number) => {
    const next = variants[(index + step + variants.length) % variants.length];
    const copy = new URLSearchParams(params);
    copy.set('variant', next.key);
    setParams(copy, { replace: true });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        target.closest('input, textarea, select, [contenteditable]') !== null
      )
        return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (import.meta.env.PROD) return null;

  const btn = {
    all: 'unset',
    cursor: 'pointer',
    px: 1,
    fontSize: 18,
    lineHeight: 1,
  } as const;

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 6px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        bgcolor: '#111',
        color: '#fff',
        borderRadius: '14px',
        boxShadow: '0 6px 24px rgba(0,0,0,.35)',
        px: 1,
        py: 0.5,
        fontSize: 12,
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 'calc(100vw - 12px)',
        opacity: 0.92,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          justifyContent: 'center',
        }}
      >
        <Box
          component="button"
          type="button"
          aria-label="Previous variant"
          onClick={() => go(-1)}
          sx={btn}
        >
          ‹
        </Box>
        <Box sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
          {variants[index].key} ({variants[index].label})
        </Box>
        <Box
          component="button"
          type="button"
          aria-label="Next variant"
          onClick={() => go(1)}
          sx={btn}
        >
          ›
        </Box>
        {axis ? (
          <Box
            component="select"
            value={params.get(axis.param) ?? axis.options[0].key}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
              const copy = new URLSearchParams(params);
              copy.set(axis.param, event.target.value);
              setParams(copy, { replace: true });
            }}
            sx={{
              ml: 1,
              bgcolor: '#333',
              color: '#fff',
              border: 0,
              borderRadius: '6px',
              fontSize: 12,
              maxWidth: 150,
            }}
          >
            {axis.options.map((o) => (
              <option key={o.key} value={o.key}>
                from: {o.label}
              </option>
            ))}
          </Box>
        ) : null}
      </Box>
      {state ? (
        <Box
          sx={{
            opacity: 0.75,
            fontSize: 10,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {Object.entries(state)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join(' · ')}
        </Box>
      ) : null}
    </Box>
  );
}

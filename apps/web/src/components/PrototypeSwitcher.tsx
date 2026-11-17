// PROTOTYPE: throwaway variant switcher. Never merge into main.
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

type Variant = { key: string; name: string };

/** Floating bottom bar that cycles `?<param>=` through `variants` (arrows, or ← → keys). Dev builds only. */
export function PrototypeSwitcher({
  param,
  variants,
}: {
  param: string;
  variants: Variant[];
}) {
  const [params, setParams] = useSearchParams();
  const current = params.get(param) ?? variants[0].key;
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );
  const go = (step: number) => {
    const next = variants[(index + step + variants.length) % variants.length];
    const copy = new URLSearchParams(params);
    copy.set(param, next.key);
    setParams(copy, { replace: true });
  };
  const goNow = { current: go };
  goNow.current = go;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest('input, textarea, [contenteditable="true"]') ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (event.key === 'ArrowLeft') goNow.current(-1);
      else if (event.key === 'ArrowRight') goNow.current(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!import.meta.env.DEV) return null;
  const button = {
    border: 0,
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
    fontSize: 18,
    padding: '4px 10px',
    cursor: 'pointer',
  } as const;
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        top: 'calc(env(safe-area-inset-top) + 8px)',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 6px',
        borderRadius: 999,
        background: '#111',
        color: '#fff',
        boxShadow: '0 6px 20px rgba(0,0,0,.35)',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <button type="button" style={button} onClick={() => go(-1)}>
        ←
      </button>
      <span style={{ minWidth: 150, textAlign: 'center' }}>
        {variants[index].key} ({variants[index].name})
      </span>
      <button type="button" style={button} onClick={() => go(1)}>
        →
      </button>
    </div>
  );
}

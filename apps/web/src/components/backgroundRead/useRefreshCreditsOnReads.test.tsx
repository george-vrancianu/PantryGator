import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { creditsQueryKey } from '@/lib/credits';
import { useRefreshCreditsOnReads } from './useRefreshCreditsOnReads';

const { settled, subscribe } = vi.hoisted(() => ({
  settled: {
    scan: [] as Array<() => void>,
    voice: [] as Array<() => void>,
    link: [] as Array<() => void>,
  },
  subscribe: (listeners: Array<() => void>) => (listener: () => void) => {
    listeners.push(listener);
    return () => listeners.splice(listeners.indexOf(listener), 1);
  },
}));

vi.mock('@/lib/scanReads', () => ({
  onScanReadSettled: subscribe(settled.scan),
}));
vi.mock('@/lib/voiceNote', () => ({
  voiceNote: { onReadSettled: subscribe(settled.voice) },
}));
vi.mock('@/lib/recipeReads', () => ({
  recipeReads: { onReadSettled: subscribe(settled.link) },
}));

describe('useRefreshCreditsOnReads', () => {
  beforeEach(() => {
    settled.scan.length = 0;
    settled.voice.length = 0;
    settled.link.length = 0;
  });

  function mount() {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return {
      ...renderHook(() => useRefreshCreditsOnReads(), { wrapper }),
      invalidate,
    };
  }

  it.each(['scan', 'voice', 'link'] as const)(
    'invalidates the Credits query when a %s read settles',
    (holder) => {
      const { invalidate } = mount();
      expect(invalidate).not.toHaveBeenCalled();

      settled[holder].forEach((listener) => listener());

      expect(invalidate).toHaveBeenCalledTimes(1);
      expect(invalidate).toHaveBeenCalledWith({ queryKey: creditsQueryKey });
    },
  );

  it('stops listening when unmounted', () => {
    const { unmount } = mount();
    unmount();
    expect(settled.scan).toHaveLength(0);
    expect(settled.voice).toHaveLength(0);
    expect(settled.link).toHaveLength(0);
  });
});

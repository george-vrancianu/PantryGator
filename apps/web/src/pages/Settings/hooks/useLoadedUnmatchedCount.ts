import { skipToken, useQuery } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { unmatchedQueueQueryKey, type UnmatchedPage } from '@/lib/unmatched';

/**
 * The open unmatched queue, only if the Admin page (or an earlier visit) already
 * loaded all of it. Subscribes to the cache and never fetches.
 */
export function useLoadedUnmatchedCount(enabled: boolean): number | null {
  const { data } = useQuery<InfiniteData<UnmatchedPage>>({
    queryKey: unmatchedQueueQueryKey('open'),
    queryFn: skipToken,
    enabled,
  });
  if (!data) return null;
  const last = data.pages[data.pages.length - 1];
  if (!last || last.nextCursor !== null) return null;
  return new Set(
    data.pages.flatMap((page) => page.entries.map((e) => e.normalizedName)),
  ).size;
}

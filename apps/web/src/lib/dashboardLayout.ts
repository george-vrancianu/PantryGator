import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiRequest } from './api';
import {
  DASHBOARD_LAYOUT_KEY,
  WIDGET_SIZES,
  type DashboardLayout,
  type WidgetInstance,
  type WidgetSize,
  type WidgetType,
} from './dashboard';

/** Move a Widget to `toIndex` (clamped); an unknown id leaves the layout unchanged. */
export function moveWidget(
  widgets: WidgetInstance[],
  id: string,
  toIndex: number,
): WidgetInstance[] {
  const from = widgets.findIndex((w) => w.id === id);
  if (from === -1) return widgets;
  const target = Math.max(0, Math.min(toIndex, widgets.length - 1));
  if (target === from) return widgets;
  const next = widgets.slice();
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved as WidgetInstance);
  return next;
}

export function removeWidget(
  widgets: WidgetInstance[],
  id: string,
): WidgetInstance[] {
  return widgets.filter((w) => w.id !== id);
}

/** Change a Widget's size, ignoring sizes its type does not support. */
export function resizeWidget(
  widgets: WidgetInstance[],
  id: string,
  size: WidgetSize,
): WidgetInstance[] {
  return widgets.map((w) =>
    w.id === id && WIDGET_SIZES[w.type]?.sizes.includes(size)
      ? { ...w, size }
      : w,
  );
}

/** The size a size control switches to: the next one after `current` that the viewport offers (wrapping), or `current` if there is none. */
export function nextSize(
  sizes: WidgetSize[],
  available: WidgetSize[],
  current: WidgetSize,
): WidgetSize {
  const start = sizes.indexOf(current);
  for (let step = 1; step <= sizes.length; step += 1) {
    const candidate = sizes[(start + step) % sizes.length] as WidgetSize;
    if (candidate !== current && available.includes(candidate)) {
      return candidate;
    }
  }
  return current;
}

/** A fresh Widget id. `crypto.randomUUID` only exists in secure contexts, so plain-HTTP LAN access needs the fallback. */
export function newWidgetId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Append a new Widget of `type` at its default size. */
export function addWidget(
  widgets: WidgetInstance[],
  type: WidgetType,
  newId: () => string = newWidgetId,
): WidgetInstance[] {
  return [
    ...widgets,
    { id: newId(), type, size: WIDGET_SIZES[type].defaultSize },
  ];
}

/** Widget types not yet on the dashboard, in registry order (the gallery never offers a type twice). */
export function availableWidgetTypes(widgets: WidgetInstance[]): WidgetType[] {
  const present = new Set(widgets.map((w) => w.type));
  return (Object.keys(WIDGET_SIZES) as WidgetType[]).filter(
    (type) => !present.has(type),
  );
}

/**
 * Apply an edit to the Member's layout: the cache updates at once (changes are
 * live) and the whole layout is saved. Saves are serialised so the last edit
 * wins. A failed save raises `error` and a later successful one clears it; the
 * stored layout is refetched (re-syncing the cache) when the last save in flight settles.
 */
export function useEditDashboardLayout() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<Error | null>(null);
  const save = useMutation({
    mutationKey: DASHBOARD_LAYOUT_KEY,
    scope: { id: 'dashboard-layout' },
    mutationFn: (layout: DashboardLayout) =>
      apiRequest<DashboardLayout>('/dashboard-layout', {
        method: 'PUT',
        body: layout,
      }),
    onSuccess: () => setError(null),
    onError: setError,
    onSettled: () => {
      // The settling save still counts as in flight here; any other means a newer edit is queued.
      if (queryClient.isMutating({ mutationKey: DASHBOARD_LAYOUT_KEY }) === 1) {
        void queryClient.invalidateQueries({ queryKey: DASHBOARD_LAYOUT_KEY });
      }
    },
  });

  return {
    error,
    reset: () => setError(null),
    async edit(change: (widgets: WidgetInstance[]) => WidgetInstance[]) {
      // A refetch still in flight would overwrite this edit with stale data.
      await queryClient.cancelQueries({ queryKey: DASHBOARD_LAYOUT_KEY });
      const current =
        queryClient.getQueryData<DashboardLayout>(DASHBOARD_LAYOUT_KEY);
      if (!current) return;
      const next = { widgets: change(current.widgets) };
      if (next.widgets === current.widgets) return;
      queryClient.setQueryData(DASHBOARD_LAYOUT_KEY, next);
      save.mutate(next);
    },
  };
}

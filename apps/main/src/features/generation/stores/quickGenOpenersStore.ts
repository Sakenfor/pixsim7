/**
 * Quick Gen opener registry.
 *
 * A small registry of "how to reveal a Quick Gen surface" — keyed by the same
 * `widgetId` a QuickGenWidget registers for CAP_GENERATION_WIDGET. It is the
 * complement to the staging queue (quickGenStagingStore): the queue carries
 * *what* to do, an opener knows how to *open the surface that will drain it*.
 *
 * This is what an "Open With <surface>" picker calls — stage a targeted intent,
 * then invoke that surface's opener so it mounts/opens and consumes the intent.
 * Surfaces register themselves while they can be opened (e.g. Control Center,
 * whose dock toggle works regardless of the widget's open state).
 *
 * In-memory only (holds live callbacks) — never persisted.
 */
import { create } from 'zustand';

export interface QuickGenOpener {
  /** Matches a QuickGenWidget's `widgetId` / its CAP_GENERATION_WIDGET id. */
  widgetId: string;
  /** Human label for an "Open With" picker. */
  label: string;
  /** Reveal/open this surface so its widget opens and drains staged intents. */
  open: () => void;
  /** Sort hint for listings (lower first). */
  order?: number;
}

interface QuickGenOpenersState {
  openers: Record<string, QuickGenOpener>;
  register: (opener: QuickGenOpener) => void;
  unregister: (widgetId: string) => void;
}

export const useQuickGenOpenersStore = create<QuickGenOpenersState>((set) => ({
  openers: {},
  register: (opener) =>
    set((s) => ({ openers: { ...s.openers, [opener.widgetId]: opener } })),
  unregister: (widgetId) =>
    set((s) => {
      if (!(widgetId in s.openers)) return s;
      const next = { ...s.openers };
      delete next[widgetId];
      return { openers: next };
    }),
}));

/** Non-React lookup for a single surface opener (for action handlers). */
export function getQuickGenOpener(widgetId: string): QuickGenOpener | undefined {
  return useQuickGenOpenersStore.getState().openers[widgetId];
}

/** Non-React snapshot of all registered openers, sorted for display. */
export function listQuickGenOpeners(): QuickGenOpener[] {
  return Object.values(useQuickGenOpenersStore.getState().openers).sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label),
  );
}

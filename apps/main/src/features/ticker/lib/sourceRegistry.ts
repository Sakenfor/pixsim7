/**
 * Ticker source registry.
 *
 * A `TickerSource` produces `TickerEvent`s that get merged into a buffered,
 * scrolling marquee. The generic `<Ticker />` consumer reads enabled sources
 * from `tickerSettingsStore` and subscribes to each — sources never render.
 *
 * Registration happens via side-effect modules (see `*.registrations.ts`)
 * eagerly imported from `main.tsx`, matching `stores-registry-canon`.
 *
 * The shape mirrors the existing notifications system on purpose: `refType`
 * + `refId` is the typed click-target pattern from `Notification` (see
 * `apps/main/src/features/notifications/components/NotificationActivityBarWidget.tsx`).
 * Click-through reuses the same navigation helpers — see `clickThrough.ts`.
 */

export interface TickerEvent {
  /** Stable id; same id replaces the previous event in the buffer. */
  id: string;
  /** Source that produced this event (matches `TickerSource.id`). */
  sourceId: string;
  /** Body text shown in the marquee. */
  message: string;
  /** Optional emoji or @lib/icons name shown before the message. */
  icon?: string;
  /** Optional tailwind text-color class (`text-blue-500` etc.). */
  color?: string;
  /**
   * Typed click target — mirrors `Notification.ref_type` /
   * `Notification.ref_id`. Consumed by `handleTickerEventClick`. When
   * present, the event renders as a clickable element.
   */
  refType?: string;
  refId?: string;
  /**
   * Escape-hatch external/SPA URL. Use only when there's no canonical
   * `refType` — prefer the typed pattern for everything in-app.
   */
  href?: string;
  /** ms since epoch — used for TTL eviction and ordering. */
  timestamp: number;
  /**
   * Override the default 60s TTL. Use larger values for long-shelf items
   * (worklog entries, AI digest blurbs).
   */
  ttl?: number;
  /** Bypass TTL entirely. For "stuck generation" anomaly alerts and similar. */
  pinned?: boolean;
}

export interface TickerSource {
  /** Stable, kebab-case id — namespaced is fine (`notifications:plan`). */
  id: string;
  /** Human-readable label for the settings UI. */
  label: string;
  /** Optional one-line description for the settings tooltip. */
  description?: string;
  /**
   * Whether the source is enabled by default for users who haven't toggled
   * it explicitly. Defaults to `false`.
   */
  defaultEnabled?: boolean;
  /**
   * Subscribe to live events. Push events into the buffer via `emit`.
   * Returns an unsubscribe function called when the source is disabled or
   * the consumer unmounts.
   */
  subscribe(emit: (event: TickerEvent) => void): () => void;
  /**
   * Optional one-shot hydrate run on mount — useful for sources whose
   * "live" stream is just deltas (e.g. plans worklog) and need a backlog
   * on first render.
   */
  initial?: () => Promise<TickerEvent[]>;
}

const sources = new Map<string, TickerSource>();
const listeners = new Set<() => void>();
/**
 * Cached snapshot for `useSyncExternalStore`. Must keep the SAME reference
 * between mutations or React will treat every render as a store change and
 * re-render-loop ("getSnapshot should be cached" warning → max-update-depth).
 * Invalidated to `null` on every register/unregister; rebuilt lazily.
 */
let cachedSnapshot: TickerSource[] | null = null;

/**
 * Register (or replace) a ticker source. Idempotent on identical refs.
 * Triggers re-subscription in any mounted `<Ticker />`.
 */
export function registerTickerSource(source: TickerSource): void {
  const existing = sources.get(source.id);
  if (existing === source) return;
  if (existing) {
    // HMR or duplicate registration. Replace + warn to make double-imports loud.
    if (typeof console !== 'undefined') {
      console.warn(`[ticker] Source "${source.id}" already registered; replacing.`);
    }
  }
  sources.set(source.id, source);
  notify();
}

export function unregisterTickerSource(id: string): boolean {
  const removed = sources.delete(id);
  if (removed) notify();
  return removed;
}

export function getTickerSource(id: string): TickerSource | undefined {
  return sources.get(id);
}

/**
 * Snapshot of the registered sources, suitable for `useSyncExternalStore`.
 * Returns a CACHED array; same reference until a register/unregister
 * invalidates it. Do not mutate the returned array.
 */
export function listTickerSources(): TickerSource[] {
  if (cachedSnapshot === null) {
    cachedSnapshot = Array.from(sources.values());
  }
  return cachedSnapshot;
}

/**
 * Subscribe to registry changes (new source, replaced source, removed
 * source). Returns an unsubscribe function. Used by the React hook in
 * `useTickerSources` to drive re-renders.
 */
export function subscribeToTickerRegistry(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Test-only — reset registry between tests. Not exported from index. */
export function __resetTickerRegistryForTest(): void {
  sources.clear();
  listeners.clear();
  cachedSnapshot = null;
}

function notify(): void {
  cachedSnapshot = null;
  for (const cb of listeners) {
    try {
      cb();
    } catch (err) {
      console.error('[ticker] registry listener threw:', err);
    }
  }
}

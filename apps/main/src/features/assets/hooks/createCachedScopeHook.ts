/**
 * createCachedScopeHook
 *
 * Factory for building "always-on" viewer navigation scopes that live for the
 * duration of a viewer session, fed by an event bus rather than by a panel
 * being mounted. Used by `useRecentScope`, `useHistoryScope`, `useProbesScope`.
 *
 * What you get from one call:
 *   - an hmrSingleton cache `{ assets, version }` keyed by `cacheKey`
 *   - a hook that subscribes to your `subscribe()` callback once at mount,
 *     mirrors cache mutations into local state, and registers the scope with
 *     the asset viewer (label re-derived from snapshot length)
 *   - optional one-shot `bootstrap` to backfill from the server so scopes
 *     don't cold-start empty on every fresh viewer session
 *
 * The returned hook MUST be mounted singleton-style at app level — same
 * constraint as `useRecentScope`. Mounting from inside a panel that can
 * appear multiple times causes the unmount of one instance to wipe the
 * scope while siblings are still alive.
 */

import { useEffect, useMemo, useState } from 'react';

import { listAssets } from '@lib/api/assets';
import { authService } from '@lib/auth';
import { hmrSingleton } from '@lib/utils';

import { assetEvents } from '../lib/assetEvents';
import { buildAssetSearchRequest } from '../lib/searchParams';
import { fromAssetResponse, fromAssetResponses, toViewerAsset, type AssetModel } from '../models/asset';
import {
  useAssetViewerStore,
  selectIsViewerOpen,
  type ViewerAsset,
} from '../stores/assetViewerStore';

import type { AssetFilters } from './useAssets';
import { useViewerScopeSync } from './useAssetViewer';

interface ScopeCache {
  assets: ViewerAsset[];
  version: number;
}

export interface CachedScopeMutators {
  /** Push to the front (deduped by id), trimmed to `cap`. */
  prepend: (asset: ViewerAsset) => void;
  /** Update an in-place entry; no-op if not present. */
  update: (asset: ViewerAsset) => void;
  /** Drop by id; no-op if not present. */
  remove: (id: string | number) => void;
  /** Replace the whole cache (rarely needed; useful for bulk hydration). */
  replace: (assets: ViewerAsset[]) => void;
  /** Append assets that aren't already present (used by bootstrap merge). */
  augment: (assets: ViewerAsset[]) => void;
}

export interface CachedScopeOptions {
  /** Scope id passed to `useViewerScopeSync`. Used as the dropdown key. */
  scopeId: string;
  /** hmrSingleton cache key. Pick a unique string per scope. */
  cacheKey: string;
  /** Max retained entries — older items drop off the tail. */
  cap: number;
  /** Label builder; receives current cache length. */
  label: (count: number) => string;
  /**
   * Optional one-shot async backfill. Called once on hook mount; resolved
   * items are merged into the cache via `augment`, so any items that already
   * arrived via `subscribe` (prepended) keep their position at the front.
   * Errors are logged but the live event stream stays subscribed.
   */
  bootstrap?: () => Promise<ViewerAsset[]>;
  /**
   * Wire your event-bus subscriptions here. Called once on hook mount.
   * Return an unsubscribe that tears them all down.
   */
  subscribe: (mutators: CachedScopeMutators) => () => void;
}

export function createCachedScopeHook(opts: CachedScopeOptions): () => void {
  const cache = hmrSingleton<ScopeCache>(opts.cacheKey, () => ({
    assets: [],
    version: 0,
  }));

  const mutators: CachedScopeMutators = {
    prepend(asset) {
      cache.assets = [asset, ...cache.assets.filter((a) => a.id !== asset.id)].slice(0, opts.cap);
      cache.version++;
    },
    update(asset) {
      const idx = cache.assets.findIndex((a) => a.id === asset.id);
      if (idx >= 0) {
        cache.assets[idx] = asset;
        cache.version++;
      }
    },
    remove(id) {
      const before = cache.assets.length;
      cache.assets = cache.assets.filter((a) => a.id !== id);
      if (cache.assets.length !== before) cache.version++;
    },
    replace(assets) {
      cache.assets = assets.slice(0, opts.cap);
      cache.version++;
    },
    augment(assets) {
      if (assets.length === 0) return;
      const existing = new Set(cache.assets.map((a) => a.id));
      const additions = assets.filter((a) => !existing.has(a.id));
      if (additions.length === 0) return;
      cache.assets = [...cache.assets, ...additions].slice(0, opts.cap);
      cache.version++;
    },
  };

  // Bootstrap runs to a single SUCCESS per cache (not per mount), so HMR /
  // re-mounts don't refetch. But a FAILED first attempt must not be sticky:
  // the scope is an app-level singleton that mounts once, so "retry on next
  // mount" never happened — an empty-token init race or a transient `listAssets`
  // hiccup (e.g. while the backend is busy) left Recents permanently empty until
  // a full page reload. That's the "recents don't populate until I refresh
  // again" bug. So failures return the state to `idle` and retry with backoff,
  // and a WS resync (see the hook below) kicks a fresh attempt after reconnect.
  const BOOTSTRAP_RETRY_DELAYS_MS = [400, 1000, 2500, 6000, 12000];
  let bootstrapState: 'idle' | 'inflight' | 'done' = 'idle';
  let bootstrapAttempt = 0;
  // The currently-mounted scope's "re-render" signal. Bootstrap (and its
  // retries / resync) mutate the shared cache off-band — outside the wrapped
  // event mutators that bump the mount — so they ping this to flush the
  // snapshot. Module-level + reassigned per mount so an attempt that's still in
  // flight when the component remounts (React StrictMode double-mount / HMR)
  // notifies the LIVE mount on settle. Passing the bump per call broke here: the
  // remount's own `runBootstrap` hits the in-flight guard and no-ops, so its
  // bump never attached and the strip stayed empty even though bootstrap
  // succeeded (no error, hence no log).
  let notifyMounted: (() => void) | null = null;

  function runBootstrap(): void {
    if (!opts.bootstrap || bootstrapState !== 'idle') return;
    bootstrapState = 'inflight';
    opts.bootstrap()
      .then((items) => {
        mutators.augment(items);
        cache.version++;
        bootstrapState = 'done';
        bootstrapAttempt = 0;
        notifyMounted?.();
      })
      .catch((err) => {
        // Don't kill the live stream on a fetch hiccup; retry with backoff so
        // the scope self-heals instead of staying empty for the session.
        bootstrapState = 'idle';
        if (bootstrapAttempt >= BOOTSTRAP_RETRY_DELAYS_MS.length) {
          console.warn(`[${opts.scopeId} scope] bootstrap failed; giving up until next resync:`, err);
          return;
        }
        const delay = BOOTSTRAP_RETRY_DELAYS_MS[bootstrapAttempt];
        bootstrapAttempt++;
        console.warn(`[${opts.scopeId} scope] bootstrap failed (attempt ${bootstrapAttempt}); retrying in ${delay}ms:`, err);
        setTimeout(runBootstrap, delay);
      });
  }

  return function useCachedScope(): void {
    const isViewerOpen = useAssetViewerStore(selectIsViewerOpen);
    const [cacheVersion, setCacheVersion] = useState(cache.version);

    useEffect(() => {
      let cancelled = false;
      // Coalesce snapshot rebuilds to one per animation frame. Each asset
      // event resolves from its own `GET /assets/{id}` on a separate task, so
      // React can't auto-batch them — without this, a rapid generation burst
      // (10+ assets, each firing a create plus several update/poll events)
      // triggers a re-render storm: every event rebuilds the snapshot array,
      // re-runs the scope-equivalence scans, and re-renders the strip. The
      // cache itself stays updated synchronously (mutators bump `cache.version`
      // immediately); we only defer the React `setState` that reads it, so the
      // flush picks up every mutation accumulated within the frame at once.
      let rafId: number | null = null;
      const flush = () => {
        rafId = null;
        if (!cancelled) setCacheVersion(cache.version);
      };
      const bump = () => {
        if (cancelled || rafId != null) return;
        rafId = requestAnimationFrame(flush);
      };
      const wrapped: CachedScopeMutators = {
        prepend: (a) => { mutators.prepend(a); bump(); },
        update:  (a) => { mutators.update(a);  bump(); },
        remove:  (id) => { mutators.remove(id); bump(); },
        replace: (a) => { mutators.replace(a); bump(); },
        augment: (a) => { mutators.augment(a); bump(); },
      };
      const unsubscribe = opts.subscribe(wrapped);

      // Register this mount's flush so bootstrap (and its retries / resync) can
      // re-render us when they augment the cache off-band.
      notifyMounted = bump;

      // Kick the bootstrap (no-op if already succeeded / in flight — a still
      // in-flight attempt will notify us via `notifyMounted` on settle).
      runBootstrap();

      // A WS reconnect means asset events may have been missed while the socket
      // was down — re-fetch the head page to backfill the gap (mirrors what live
      // surfaces do on resync). This also recovers a scope whose very first
      // bootstrap never succeeded: force a fresh attempt by clearing a settled
      // 'done' so the retry guard doesn't short-circuit it.
      const unsubResync = assetEvents.subscribeToResync(() => {
        if (bootstrapState === 'done') {
          bootstrapState = 'idle';
          bootstrapAttempt = 0;
        }
        runBootstrap();
      });

      return () => {
        cancelled = true;
        if (rafId != null) cancelAnimationFrame(rafId);
        if (notifyMounted === bump) notifyMounted = null;
        unsubscribe();
        unsubResync();
      };
    }, []);

    const snapshot = useMemo(() => [...cache.assets], [cacheVersion]);
    const label = opts.label(snapshot.length);
    useViewerScopeSync(opts.scopeId, label, snapshot, isViewerOpen && snapshot.length > 0);
  };
}

/**
 * Wire the standard asset-event triad — create→prepend, update→update,
 * removal→remove — into a cached scope's mutators. This is the body every
 * event-fed scope (Recent, Probes) shares; the only thing that varies is an
 * optional `accept` predicate that filters create/update to a subset (e.g.
 * `assetKind === 'probe'`, or "not broken"). Removal events carry only an id and
 * are applied unconditionally — `remove` no-ops when the id isn't in the cache.
 *
 * When `accept` is given, an UPDATE that newly fails it removes the entry rather
 * than just skipping the update — so an asset that transitions out of the subset
 * (e.g. you manually flag a clip broken, or a probe is reclassified) drops out of
 * the scope instead of lingering with its stale pre-transition snapshot.
 *
 * Returns an unsubscribe that tears down all three subscriptions.
 */
export function subscribeAssetEventStream(
  { prepend, update, remove }: Pick<CachedScopeMutators, 'prepend' | 'update' | 'remove'>,
  accept?: (model: AssetModel) => boolean,
): () => void {
  const unsubCreate = assetEvents.subscribe((response) => {
    const model = fromAssetResponse(response);
    if (accept && !accept(model)) return;
    prepend(toViewerAsset(model));
  });
  const unsubUpdate = assetEvents.subscribeToUpdates((response) => {
    const model = fromAssetResponse(response);
    if (accept && !accept(model)) {
      remove(model.id);
      return;
    }
    update(toViewerAsset(model));
  });
  const unsubRemove = assetEvents.subscribeToRemovals((assetId) => {
    remove(assetId);
  });
  return () => {
    unsubCreate();
    unsubUpdate();
    unsubRemove();
  };
}

/**
 * Convenience helper for the common bootstrap shape: fetch a page of assets
 * by filters and convert to `ViewerAsset[]`. Use as
 * `bootstrap: () => bootstrapFromFilters({ asset_kind: 'probe' }, 100)`.
 *
 * `AssetFilters` only types the well-known keys; extras like `asset_kind`
 * are picked up by `extractExtraRegistryFilters` inside
 * `buildAssetSearchRequest`. We accept arbitrary extras here so callers
 * don't need a cast at every call site.
 */
export async function bootstrapFromFilters(
  filters: AssetFilters & Record<string, unknown>,
  limit: number,
): Promise<ViewerAsset[]> {
  // App-level scopes mount before route/auth guards settle, so the token may not
  // be readable on the very first attempt. THROW so the caller's bootstrap
  // RETRIES — returning [] here resolves as a successful empty bootstrap and
  // leaves the scope permanently empty until a full reload. A genuine 401 below
  // still resolves to [] (logged-out, not not-ready-yet), so this never retries
  // a real auth failure.
  if (!authService.getStoredToken()) {
    throw new Error('[bootstrap] auth token not ready yet');
  }

  try {
    const data = await listAssets(buildAssetSearchRequest(filters, { limit }));
    return fromAssetResponses(data.assets).map(toViewerAsset);
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 401) {
      // Token was cleared/expired mid-bootstrap; leave scope empty and let the
      // global unauthorized flow handle navigation/state.
      return [];
    }
    throw error;
  }
}

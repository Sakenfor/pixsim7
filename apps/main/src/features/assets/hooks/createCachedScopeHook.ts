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

import { buildAssetSearchRequest } from '../lib/searchParams';
import { fromAssetResponses, toViewerAsset } from '../models/asset';
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

  // Bootstrap is fired once per cache (not per mount), so HMR / re-mounts
  // don't refetch. Tracked by promise so concurrent callers de-dupe.
  let bootstrapPromise: Promise<void> | null = null;
  function ensureBootstrap(): Promise<void> {
    if (!opts.bootstrap || bootstrapPromise) return bootstrapPromise ?? Promise.resolve();
    bootstrapPromise = opts.bootstrap()
      .then((items) => {
        mutators.augment(items);
        cache.version++;
      })
      .catch((err) => {
        // Don't kill the live stream on a fetch hiccup; log and move on.
        console.warn(`[${opts.scopeId} scope] bootstrap failed:`, err);
        // Allow a future retry on next hook mount.
        bootstrapPromise = null;
      });
    return bootstrapPromise;
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

      // Kick the bootstrap (no-op if already resolved). Bump on completion
      // so the snapshot picks up the augmented items.
      ensureBootstrap().then(bump);

      return () => {
        cancelled = true;
        if (rafId != null) cancelAnimationFrame(rafId);
        unsubscribe();
      };
    }, []);

    const snapshot = useMemo(() => [...cache.assets], [cacheVersion]);
    const label = opts.label(snapshot.length);
    useViewerScopeSync(opts.scopeId, label, snapshot, isViewerOpen && snapshot.length > 0);
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
  // App-level scopes mount before route/auth guards settle. Skip bootstrap when
  // no token is present instead of emitting expected 401 noise.
  if (!authService.getStoredToken()) {
    return [];
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

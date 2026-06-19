/**
 * useClientLoadedAssets — reactive bridge from a client-loaded `AssetSource`
 * into the gallery's filter/group/paginate pipeline.
 *
 * This is the keystone of "local folders as a gallery scope": it turns the
 * source's imperative `getAll()` + `subscribe()` into a reactive `AssetModel[]`
 * via `useSyncExternalStore`, and (by default) hydrates the source
 * (`lifecycle.load`) on mount. The returned array is whatever the source's
 * `getAll()` yields — for the local source, the same `AssetModel`-shaped data
 * the controller exposes — so the existing `useClientFilters`/grouping/
 * `usePagedItems` engine applies unchanged, regardless of which source produced
 * it.
 *
 * Pass `{ autoLoad: false }` when another owner already drives the source's
 * lifecycle (e.g. the local-folders controller hydrates with userId-gating that
 * `lifecycle.load()` does not replicate) — then this hook only provides the
 * reactive read and won't trigger a second, ungated load.
 *
 * The companion server-paged path is the existing `useAssets` hook; a source's
 * `capabilities.fetchMode` tells the gallery which to use.
 */

import { useEffect, useSyncExternalStore } from 'react';

import type { AssetModel } from '../hooks/useAssets';

import type { AssetSource } from './assetSource';

const EMPTY: AssetModel[] = [];
const noopSubscribe = () => () => {};

export interface UseClientLoadedAssetsOptions {
  /** Hydrate the source via `lifecycle.load()` on mount. Default true. */
  autoLoad?: boolean;
}

/**
 * Subscribe to a client-loaded source's assets. Throws if handed a source that
 * does not support the client-loaded read path — callers gate on
 * `source.capabilities.fetchMode === 'client-loaded'` (a stable per-instance
 * value, so the hook order never changes across renders for a given source).
 */
export function useClientLoadedAssets<T extends AssetModel = AssetModel>(
  source: AssetSource,
  options?: UseClientLoadedAssetsOptions,
): T[] {
  const { getAll, subscribe } = source;
  const autoLoad = options?.autoLoad ?? true;

  // Hooks run unconditionally (stable order); the misuse guard throws below.
  useEffect(() => {
    if (!autoLoad) return;
    void source.lifecycle.load();
  }, [source, autoLoad]);

  const assets = useSyncExternalStore(
    subscribe ?? noopSubscribe,
    getAll ?? (() => EMPTY),
    getAll ?? (() => EMPTY),
  );

  if (source.capabilities.fetchMode !== 'client-loaded' || !getAll || !subscribe) {
    throw new Error(
      `useClientLoadedAssets requires a client-loaded source, got '${source.identity.typeId}' (${source.capabilities.fetchMode}).`,
    );
  }

  return assets as T[];
}

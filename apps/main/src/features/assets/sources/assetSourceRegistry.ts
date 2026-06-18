/**
 * Asset source adapter registry.
 *
 * The discovery layer for the data-layer `AssetSource` seam: the gallery
 * enumerates registered sources to render its scope switcher and picks the read
 * path per source by capability. This is intentionally distinct from
 * `features/gallery/lib/core/assetSources` (which registers whole React
 * *components*) — that registry is what the surface-collapse replaces; this one
 * registers the data adapters a single gallery view consumes.
 */

import type { AssetSource } from './assetSource';
import { localFolderSource } from './localFolderSource';
import { remoteAssetSource } from './remoteAssetSource';

const registry = new Map<string, AssetSource>();

/** Register (or replace) a source adapter, keyed by `identity.typeId`. */
export function registerAssetSourceAdapter(source: AssetSource): void {
  registry.set(source.identity.typeId, source);
}

/** Resolve a source adapter by type id. */
export function getAssetSourceAdapter(typeId: string): AssetSource | undefined {
  return registry.get(typeId);
}

/** All registered source adapters, in registration order. */
export function getAllAssetSourceAdapters(): AssetSource[] {
  return Array.from(registry.values());
}

// Seed the built-in sources. Remote first so it is the default scope.
registerAssetSourceAdapter(remoteAssetSource);
registerAssetSourceAdapter(localFolderSource);

/**
 * AssetSource — data-layer seam for the unified gallery.
 *
 * The gallery is a single view over multiple *sources* behind one
 * filter/group/paginate pipeline:
 *   - backend library  (server-paged, today's default)        → RemoteAssetSource
 *   - local folders    (client-loaded, browser FSA handles)   → LocalFolderSource
 *   - object-store / remote roots (MinIO direction)           → see below
 *
 * --- Remote roots / storage tiering (plan `media-storage-tiering`) ---
 *
 * That plan offloads heavy originals to a secondary/remote root (self-hosted
 * MinIO over ZeroTier) via a per-asset `storage_root_id` + presigned-URL serve
 * redirects. Crucially that is a BACKEND storage concern: tiered assets are
 * still ordinary backend library rows whose bytes merely live elsewhere, so
 * `RemoteAssetSource` already browses them with zero changes — the gallery never
 * sees where the bytes are. The only *new* source this seam would need is
 * "browse a remote root directly" (objects not yet in the library); that plugs
 * in exactly like the two adapters here — implement `AssetSource` (server-paged
 * `list()` or client-loaded `getAll()`/`subscribe()`), gate optional
 * capabilities, and register via `registerAssetSourceAdapter`. No seam change.
 *
 * This is deliberately a DATA abstraction, distinct from the existing
 * `SourceController` (in @pixsim7/shared.sources.core), which is a *React
 * controller* abstraction shaped around UI state (previews, viewer, viewMode).
 * The duplication the `local-folders-as-gallery-source` plan targets comes from
 * each source shipping a whole bespoke controller+component; this seam lets one
 * gallery view drive any source's data, with local-only concerns (FSA handle,
 * client hashing, "in library?" badge, ingest) modeled as *capabilities*.
 *
 * --- The dual-mode contract ---
 *
 * Sources fetch fundamentally differently, so `capabilities.fetchMode` tags
 * which read path a source supports:
 *
 *   'server-paged'   — query the server one page at a time (cursor/offset),
 *                      filter+sort server-side. Implements `list(query)`.
 *                      (RemoteAssetSource over `useAssets`/`listAssets`.)
 *
 *   'client-loaded'  — the entire asset set lives in memory; the gallery runs
 *                      its client filter/group/paginate engine over it.
 *                      Implements `getAll()` + `subscribe()`.
 *                      (LocalFolderSource over the `useLocalFolders` store.)
 *
 * Every other capability (hash / libraryStatus / ingest / folder lifecycle) is
 * optional and gated by a `capabilities.*` flag, so the gallery can render the
 * right contextual controls (e.g. the ingest toolbar) without knowing the
 * concrete source type.
 */

import type { AssetFilters, AssetModel } from '../hooks/useAssets';

// ============================================================================
// Identity & capabilities
// ============================================================================

export type AssetSourceFetchMode = 'server-paged' | 'client-loaded';

export interface AssetSourceIdentity {
  /** Source type ID (e.g. 'local-fs', 'remote-gallery'). */
  typeId: string;
  /** Instance ID — unique per type (one per type for now; multi-instance later). */
  instanceId: string;
  /** Human-readable display name. */
  label: string;
  /** Grouping category. */
  kind: 'local' | 'remote' | 'cloud' | 'social';
  /** Icon identifier (@lib/icons name). */
  icon: string;
}

export interface AssetSourceCapabilities {
  /** Which read path this source supports. */
  fetchMode: AssetSourceFetchMode;
  /** Source can bring an asset into the library/provider (`ingest`). */
  canIngest: boolean;
  /** Source supports client-side content hashing (`hash`). */
  canHash: boolean;
  /** Source can report backend library membership (`libraryStatus`). */
  hasLibraryStatus: boolean;
  /** Source exposes folder lifecycle (add/remove/refresh) via `lifecycle.folders`. */
  hasFolders: boolean;
}

// ============================================================================
// Read contracts
// ============================================================================

/** Query for a `server-paged` source's `list()`. Mirrors `useAssets` inputs. */
export interface AssetListQuery {
  filters?: AssetFilters;
  limit?: number;
  /** Keyset cursor (preferred); falls back to `offset` when absent. */
  cursor?: string | null;
  offset?: number;
}

/** One page of results from a `server-paged` source. */
export interface AssetPage {
  assets: AssetModel[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ============================================================================
// Capability payloads
// ============================================================================

/** Backend library membership for a source-local asset. */
export interface AssetLibraryStatus {
  inLibrary: boolean;
  /** Backend asset id when `inLibrary` is true. */
  assetId?: number;
}

export interface AssetIngestOptions {
  /** Where to land the asset; defaults to 'library' unless a provider is given. */
  saveTarget?: 'provider' | 'library';
  /** Target provider id when `saveTarget === 'provider'`. */
  providerId?: string;
}

export interface AssetIngestResult {
  /** Backend asset id, when the upload created/linked one. */
  assetId?: number;
  /** Provider the asset landed in. */
  providerId?: string;
  /** Human-readable note from the server (e.g. "Already in library"). */
  note?: string;
}

/** Folder lifecycle for sources whose assets are grouped under folders. */
export interface AssetSourceFolders {
  /** Currently registered folders. */
  list(): Array<{ id: string; name: string }>;
  /** Add (or reconnect) a folder — opens the platform picker. */
  add(): Promise<void>;
  /** Remove a folder by id. */
  remove(id: string): Promise<void>;
  /** Rescan a folder by id. */
  refresh(id: string): Promise<void>;
}

/** Mount/refresh + optional folder management for a source. */
export interface AssetSourceLifecycle {
  /** Hydrate the source (e.g. load persisted folders). Safe to call repeatedly. */
  load(): Promise<void> | void;
  /** Refresh all data from the underlying origin. */
  refresh(): Promise<void>;
  /** Present only when `capabilities.hasFolders` is true. */
  folders?: AssetSourceFolders;
}

// ============================================================================
// The seam
// ============================================================================

/**
 * A queryable asset source. Methods beyond the read path are optional and
 * present iff the matching `capabilities.*` flag is set — callers MUST gate on
 * the flag (or a truthy method) rather than assume availability.
 *
 * `key` is the source-local stable identifier for an asset. For client-loaded
 * sources it is `AssetModel`-shaped (`LocalAssetModel.key`); for server-paged
 * sources it is the stringified backend id.
 */
export interface AssetSource {
  readonly identity: AssetSourceIdentity;
  readonly capabilities: AssetSourceCapabilities;

  // --- Read: server-paged path ---
  /** Fetch one page. Present iff `fetchMode === 'server-paged'`. */
  list?(query: AssetListQuery): Promise<AssetPage>;

  // --- Read: client-loaded path ---
  /**
   * Snapshot of all loaded assets, newest first. Present iff
   * `fetchMode === 'client-loaded'`. MUST return a referentially-stable array
   * until the underlying data mutates (so it is safe for useSyncExternalStore).
   */
  getAll?(): AssetModel[];
  /** Subscribe to data changes; returns an unsubscribe. Pairs with `getAll`. */
  subscribe?(listener: () => void): () => void;

  /** Resolve a single asset by source-local key. */
  get(key: string): AssetModel | undefined | Promise<AssetModel | undefined>;

  /** Raw bytes for an asset (FSA file for local, fetched blob for remote). */
  file(key: string): Promise<File | Blob | undefined>;

  // --- Optional capabilities ---
  /** Ensure sha256 is computed for the given keys. Iff `capabilities.canHash`. */
  hash?(keys: string[]): Promise<void>;
  /** Resolve backend library membership. Iff `capabilities.hasLibraryStatus`. */
  libraryStatus?(keys: string[]): Promise<Record<string, AssetLibraryStatus>>;
  /** Bring an asset into the library/provider. Iff `capabilities.canIngest`. */
  ingest?(key: string, options?: AssetIngestOptions): Promise<AssetIngestResult>;

  /** Mount/refresh + folder management. */
  lifecycle: AssetSourceLifecycle;
}

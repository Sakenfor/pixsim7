import type { ComponentType } from 'react';

/**
 * Asset Source System
 *
 * Sources represent where assets come from (remote DB, local FS, cloud providers).
 * This is orthogonal to Surfaces, which define how remote DB assets are displayed.
 */

export type AssetSourceId =
  | 'remote-gallery'  // DB-backed remote assets (uses surfaces)
  | 'local-fs'        // Local filesystem folders
  | string;           // Future: 'google-drive', 'pinterest', etc.

export interface AssetSourceInfo {
  id: AssetSourceId;
  label: string;
  icon: string;
  kind: 'remote' | 'local' | 'cloud';
}

export interface AssetSourceComponentProps {
  layout: 'masonry' | 'grid';
  cardSize: number;
  overlayPresetId?: string;
}

export interface AssetSourceDefinition {
  id: AssetSourceId;
  label: string;
  icon: string;
  kind: 'remote' | 'local' | 'cloud';
  component: ComponentType<AssetSourceComponentProps>;
  description?: string;
}

/**
 * Global registry of available asset sources
 */
export const assetSourceRegistry = new Map<AssetSourceId, AssetSourceDefinition>();

/**
 * Register an asset source
 */
export function registerAssetSource(definition: AssetSourceDefinition) {
  assetSourceRegistry.set(definition.id, definition);
}

/**
 * Get an asset source by ID
 */
export function getAssetSource(id: AssetSourceId): AssetSourceDefinition | undefined {
  return assetSourceRegistry.get(id);
}

/**
 * Get all registered asset sources
 */
export function getAllAssetSources(): AssetSourceDefinition[] {
  return Array.from(assetSourceRegistry.values());
}

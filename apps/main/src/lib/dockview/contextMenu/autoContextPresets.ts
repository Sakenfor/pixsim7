/**
 * Type-Specific Configuration Presets
 *
 * Registers auto-context configuration for common types.
 * Import this module early in app initialization to enable zero-config
 * auto-registration for standard types.
 *
 * Usage:
 * ```ts
 * // In app init (e.g., main.tsx)
 * import '@lib/dockview';
 *
 * // Then in components - zero config needed:
 * const ctx = useAutoContextMenu('asset', asset);
 * ```
 */

import { autoContextConfigRegistry, type AutoContextConfig } from './autoContextMenu';

// ============================================================================
// Asset Configuration
// ============================================================================

interface AssetLike {
  id: number | string;
  description?: string | null;
  providerAssetId?: string | null;
  mediaType?: string;
  providerId?: string;
  thumbnailUrl?: string | null;
  providerStatus?: string;
  syncStatus?: string;
  remoteUrl?: string | null;
}

const assetConfig: AutoContextConfig<AssetLike> = {
  idField: 'id',

  // Label fallback chain: description > providerAssetId > "Asset {id}"
  computeLabel: asset =>
    asset.description ||
    asset.providerAssetId ||
    `Asset ${asset.id}`,

  // Core fields for asset actions
  computeFields: asset => {
    // Compute derived field
    const isLocalOnly =
      asset.providerStatus === 'local_only' ||
      (asset.syncStatus === 'downloaded' && !asset.remoteUrl);

    return {
      id: asset.id,
      type: asset.mediaType,
      provider: asset.providerId,
      providerAssetId: asset.providerAssetId,
      thumbnailUrl: asset.thumbnailUrl,
      isLocalOnly,
    };
  },

  // Include full asset object for complex actions
  includeFullObject: true,
};

autoContextConfigRegistry.register('asset', assetConfig);

// ============================================================================
// Prompt Configuration
// ============================================================================

interface PromptLike {
  id: number | string;
  title?: string;
  text?: string;
  category?: string;
  tags?: string[];
}

const promptConfig: AutoContextConfig<PromptLike> = {
  idField: 'id',
  labelField: 'title',

  computeFields: prompt => ({
    id: prompt.id,
    title: prompt.title,
    text: prompt.text,
    category: prompt.category,
    tags: prompt.tags,
  }),

  includeFullObject: true,
};

autoContextConfigRegistry.register('prompt', promptConfig);

// ============================================================================
// Generation Configuration
// ============================================================================

interface GenerationLike {
  id: number | string;
  prompt?: string;
  status?: string;
  providerId?: string;
  operationType?: string;
}

const generationConfig: AutoContextConfig<GenerationLike> = {
  idField: 'id',

  computeLabel: gen =>
    gen.prompt?.slice(0, 50) || `Generation ${gen.id}`,

  computeFields: gen => ({
    id: gen.id,
    status: gen.status,
    provider: gen.providerId,
    operationType: gen.operationType,
  }),

  includeFullObject: true,
};

autoContextConfigRegistry.register('generation', generationConfig);

// ============================================================================
// Scene Configuration
// ============================================================================

interface SceneLike {
  id: number | string;
  name?: string;
  description?: string;
  assetCount?: number;
}

const sceneConfig: AutoContextConfig<SceneLike> = {
  idField: 'id',

  computeLabel: scene =>
    scene.name || `Scene ${scene.id}`,

  computeFields: scene => ({
    id: scene.id,
    name: scene.name,
    description: scene.description,
    assetCount: scene.assetCount,
  }),

  includeFullObject: true,
};

autoContextConfigRegistry.register('scene', sceneConfig);

// ============================================================================
// Export helpers for tree-shaking
// ============================================================================

/**
 * Re-export type-specific hooks for convenience.
 * These are tree-shakeable if not imported.
 */
export { useAssetAutoContextMenu, usePromptAutoContextMenu } from './autoContextMenu';

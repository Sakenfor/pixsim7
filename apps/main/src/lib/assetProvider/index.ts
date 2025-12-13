/**
 * Asset Provider Module
 *
 * Clean abstraction layer for asset provisioning in game components.
 *
 * @example
 * ```tsx
 * // Setup in app root
 * import { AssetProviderProvider } from '@/lib/assetProvider';
 *
 * <AssetProviderProvider config={{ generationEnabled: true }}>
 *   <App />
 * </AssetProviderProvider>
 *
 * // Usage in game component
 * import { useAssetProvider } from '@/lib/assetProvider';
 *
 * function ScenePlayer({ sceneId }) {
 *   const assetProvider = useAssetProvider();
 *   const asset = await assetProvider.requestAsset({ sceneId, choiceId });
 * }
 * ```
 */

// Context and hooks
export {
  AssetProviderProvider,
  useAssetProvider,
  useAssetProviderOptional,
  useAssetService,
  // Test utilities
  createMockAssetProvider,
  TestAssetProviderProvider,
  type AssetProviderProviderProps,
} from './AssetProviderContext';

// Service
export {
  AssetService,
  createAssetService,
  createTestAssetService,
} from './AssetService';

// Providers
export { GeneratedAssetProvider } from './providers/GeneratedAssetProvider';
export type { GeneratedAssetProviderConfig } from './providers/GeneratedAssetProvider';

export { PreMadeAssetProvider } from './providers/PreMadeAssetProvider';
export type { PreMadeAssetProviderConfig } from './providers/PreMadeAssetProvider';

// Re-export types from shared package for convenience
export type {
  Asset,
  AssetRequest,
  AssetAvailability,
  AssetMediaType,
  AssetSource,
  AssetMetadata,
  AssetStyle,
  AssetServiceConfig,
  IAssetProvider,
} from '@pixsim7/shared.types';

export {
  AssetNotFoundError,
  AssetGenerationError,
  AssetTimeoutError,
  DEFAULT_ASSET_SERVICE_CONFIG,
} from '@pixsim7/shared.types';

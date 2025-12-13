/**
 * Asset Provider Context
 *
 * React context for dependency injection of the asset provider.
 * Game components use this to access assets without knowing about
 * the underlying implementation (pre-made, generated, cached).
 *
 * @example
 * ```tsx
 * // In app root
 * <AssetProviderProvider config={{ generationEnabled: true }}>
 *   <App />
 * </AssetProviderProvider>
 *
 * // In game component
 * function ScenePlayer({ sceneId }) {
 *   const assetProvider = useAssetProvider();
 *
 *   const handleChoice = async (choiceId: string) => {
 *     const asset = await assetProvider.requestAsset({
 *       sceneId,
 *       choiceId,
 *       allowGeneration: true,
 *     });
 *     playVideo(asset.url);
 *   };
 * }
 * ```
 */

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { IAssetProvider, AssetServiceConfig } from '@pixsim7/shared.types';
import { AssetService, createAssetService } from './AssetService';

// ============================================================================
// Context
// ============================================================================

const AssetProviderContext = createContext<IAssetProvider | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

export interface AssetProviderProviderProps {
  /** Configuration for the asset service */
  config?: Partial<AssetServiceConfig>;
  /** Override the default asset provider (useful for testing) */
  provider?: IAssetProvider;
  /** Child components */
  children: ReactNode;
}

/**
 * Provider component for asset service
 *
 * Wrap your app (or a subtree) with this to enable asset provider access.
 */
export function AssetProviderProvider({
  config = {},
  provider,
  children,
}: AssetProviderProviderProps) {
  // Create or use provided asset service
  const assetProvider = useMemo(() => {
    if (provider) {
      return provider;
    }
    return createAssetService(config);
  }, [provider, config]);

  return (
    <AssetProviderContext.Provider value={assetProvider}>
      {children}
    </AssetProviderContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to access the asset provider
 *
 * @throws Error if used outside of AssetProviderProvider
 */
export function useAssetProvider(): IAssetProvider {
  const provider = useContext(AssetProviderContext);

  if (!provider) {
    throw new Error(
      'useAssetProvider must be used within an AssetProviderProvider. ' +
        'Wrap your app with <AssetProviderProvider> to use this hook.'
    );
  }

  return provider;
}

/**
 * Hook to access the asset provider (nullable version)
 *
 * Returns null if not within a provider. Useful for optional contexts.
 */
export function useAssetProviderOptional(): IAssetProvider | null {
  return useContext(AssetProviderContext);
}

/**
 * Hook to access the full AssetService (with direct provider access)
 *
 * Use this when you need access to the underlying AssetService methods
 * like getPreMadeProvider() or getGeneratedProvider().
 *
 * @throws Error if used outside of AssetProviderProvider
 * @throws Error if provider is not an AssetService instance
 */
export function useAssetService(): AssetService {
  const provider = useAssetProvider();

  if (!(provider instanceof AssetService)) {
    throw new Error(
      'useAssetService requires an AssetService instance. ' +
        'If you provided a custom provider, use useAssetProvider instead.'
    );
  }

  return provider;
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a mock asset provider for testing
 */
export function createMockAssetProvider(overrides: Partial<IAssetProvider> = {}): IAssetProvider {
  return {
    getAsset: async (assetId) => ({
      id: assetId,
      url: `https://example.com/assets/${assetId}`,
      type: 'video',
      source: 'pre-made',
      metadata: {},
    }),
    requestAsset: async (request) => ({
      id: 'mock-asset',
      url: 'https://example.com/mock-video.mp4',
      type: 'video',
      source: 'pre-made',
      metadata: {
        description: `Mock asset for ${request.sceneId ?? 'unknown'}`,
      },
    }),
    checkAvailability: async () => ({
      available: true,
      source: 'pre-made',
      assetId: 'mock-asset',
    }),
    ...overrides,
  };
}

/**
 * Test wrapper component for asset provider
 */
export function TestAssetProviderProvider({
  provider,
  children,
}: {
  provider?: IAssetProvider;
  children: ReactNode;
}) {
  const testProvider = useMemo(
    () => provider ?? createMockAssetProvider(),
    [provider]
  );

  return (
    <AssetProviderContext.Provider value={testProvider}>
      {children}
    </AssetProviderContext.Provider>
  );
}

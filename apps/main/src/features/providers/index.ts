/**
 * Providers Feature
 *
 * Provider management, account handling, capability registry,
 * and generation plugin system.
 */

// ============================================================================
// Components
// ============================================================================

export { ProviderSettingsPanel } from './components/ProviderSettingsPanel';
export { AccountRow } from './components/AccountRow';
export { CompactAccountCard } from './components/CompactAccountCard';
export { EditAccountModal } from './components/EditAccountModal';
export { DeleteConfirmModal } from './components/DeleteConfirmModal';
export { ProviderOverviewModule } from './components/ProviderOverviewModule';
export { AIProviderSettings } from './components/AIProviderSettings';
export type { AIProviderSettingsData } from './components/AIProviderSettings';

// ============================================================================
// Hooks - Provider Data
// ============================================================================

export { useProviders } from './hooks/useProviders';
export type { ProviderInfo } from './hooks/useProviders';

export { useProviderAccounts, useProviderCapacity } from './hooks/useProviderAccounts';
export type {
  ProviderAccount,
  ProviderAccountsGrouped,
  ProviderCapacity
} from './hooks/useProviderAccounts';

export { useProviderSpecs } from './hooks/useProviderSpecs';
export { useProviderIdForModel } from './hooks/useProviderIdForModel';
export { useCostEstimate } from './hooks/useCostEstimate';

export { useAiProviders } from './hooks/useAiProviders';
export type { AiProviderInfo, UseAiProvidersState } from './hooks/useAiProviders';

// ============================================================================
// Hooks - Provider Capabilities
// ============================================================================

export {
  useProviderCapabilities,
  useProviderCapability,
  usePromptLimit,
  useProviderLimits,
  useCostHints,
  useSupportedOperations,
  useProviderFeature,
  useQualityPresets,
  useAspectRatios,
  useOperationSpec,
} from './hooks/useProviderCapabilities';

// ============================================================================
// Hooks - Generation Plugins
// ============================================================================

export {
  useGenerationPlugins,
  useRenderPlugins,
  usePluginValidation,
  GenerationPluginRenderer,
} from './hooks/useGenerationPlugins';

// ============================================================================
// Lib - Core Provider System
// ============================================================================

export * from './lib/core';

// Re-export key singletons for convenience
export { providerCapabilityRegistry } from './lib/core/capabilityRegistry';

/**
 * @deprecated Use `generationUiSelectors` from `@lib/plugins/catalogSelectors` instead.
 * The generation UI plugin system is now catalog-only and this registry is no longer
 * the source of truth. Import the selectors for read access:
 *
 * ```typescript
 * import { generationUiSelectors } from '@lib/plugins/catalogSelectors';
 * const plugins = generationUiSelectors.getAll();
 * const forProvider = generationUiSelectors.getPlugins({ providerId: 'pixverse' });
 * ```
 */
export { generationUIPluginRegistry } from './lib/core/generationPlugins';

// Re-export catalog selectors as the preferred API
export { generationUiSelectors } from '@lib/plugins/catalogSelectors';

// ============================================================================
// Lib - API Clients
// ============================================================================

export {
  getAccounts,
  updateAccount,
  deleteAccount,
  toggleAccountStatus,
  updateAccountNickname,
  dryRunPixverseSync,
  connectPixverseWithGoogle,
} from './lib/api/accounts';

export type { AccountUpdate } from './lib/api/accounts';

export {
  getPixverseSyncDryRun,
  syncPixverseAssets,
  refreshAssetLineage,
} from './lib/api/pixverseSync';

export type {
  SyncDryRunItem,
  SyncDryRunCategory,
  SyncDryRunResponse,
  SyncAssetsResponse,
  LineageRefreshResult,
  LineageRefreshResponse,
} from './lib/api/pixverseSync';

export { estimatePixverseCost } from './lib/api/pixverseCost';

// ============================================================================
// Lib - Provider Plugins
// ============================================================================

export { registerProviderPlugins, pixversePlugin, soraPlugin } from './lib/plugins';

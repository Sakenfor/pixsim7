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
export { generationUIPluginRegistry } from './lib/core/generationPlugins';

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

export type { UpdateAccountRequest } from './lib/api/accounts';

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

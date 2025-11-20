/**
 * Provider Capability Registry & Plugin System
 *
 * Exports:
 * - Type definitions for provider capabilities
 * - Capability registry (singleton)
 * - React hooks for capability access
 * - Generation UI plugin system
 * - Plugin hooks and components
 */

// Types
export type {
  ProviderCapability,
  ProviderInfo,
  ProviderLimits,
  CostHints,
  OperationSpec,
  OperationParameterSpec,
  ProviderFeatures,
} from './types';

// Registry
export {
  ProviderCapabilityRegistry,
  providerCapabilityRegistry,
} from './capabilityRegistry';
export type { CapabilityRegistryConfig } from './capabilityRegistry';

// Hooks
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
} from './hooks';

// Plugin system
export {
  GenerationUIPluginRegistry,
  generationUIPluginRegistry,
  defineGenerationUIPlugin,
} from './generationPlugins';
export type {
  GenerationUIPlugin,
  GenerationUIPluginProps,
  ValidationResult,
} from './generationPlugins';

// Plugin hooks
export {
  useGenerationPlugins,
  useRenderPlugins,
  usePluginValidation,
  GenerationPluginRenderer,
} from './pluginHooks';

/**
 * Provider Core System
 *
 * Core types, capability registry, and generation plugin system.
 */

export type {
  OperationParameterSpec,
  OperationSpec,
  ProviderFeatures,
  ProviderLimits,
  CostHints,
  CostEstimatorConfig,
  ProviderCapability,
  ProviderInfo,
} from './types';

export { ProviderCapabilityRegistry, providerCapabilityRegistry } from './capabilityRegistry';
export type { CapabilityRegistryConfig } from './capabilityRegistry';

export {
  GenerationUIPluginRegistry,
  generationUIPluginRegistry,
  defineGenerationUIPlugin,
} from './generationPlugins';
export type {
  GenerationUIPluginProps,
  ValidationResult,
  GenerationUIPlugin,
} from './generationPlugins';

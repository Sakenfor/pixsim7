export { ContextHubHost } from "./components/ContextHubHost";
export { useContextHubState, useContextHubHostId } from "./hooks/contextHubContext";
export type { ContextHubState } from "./hooks/contextHubContext";
export { useCapability, useProvideCapability, usePanelContext } from "./hooks";
export {
  CAP_ASSET,
  CAP_ASSET_LIST,
  CAP_ASSET_SELECTION,
  CAP_SCENE_CONTEXT,
  CAP_WORLD_CONTEXT,
  CAP_PROJECT_CONTEXT,
  CAP_GENERATION_CONTEXT,
  CAP_PROMPT_BOX,
  CAP_ASSET_INPUT,
  CAP_GENERATE_ACTION,
  CAP_EDITOR_CONTEXT,
  CAP_PANEL_CONTEXT,
  CAP_GENERATION_WIDGET,
  CAP_GENERATION_SOURCE,
} from "./domain/capabilities";
export {
  APP_ACTION_KEY_PREFIX,
  APP_STATE_KEY_PREFIX,
  getAppActionCapabilityKey,
  getAppStateCapabilityKey,
} from "./domain/appCapabilityBridge";
export type {
  AssetSelection,
  SceneContextSummary,
  WorldContextSummary,
  ProjectContextSummary,
  GenerationContextSummary,
  PromptBoxContext,
  AssetInputContext,
  GenerateActionContext,
  EditorContextSnapshot,
  PanelContextCapability,
  GenerationWidgetContext,
  GenerationSourceMode,
  GenerationSourceContext,
} from "./domain/capabilities";
export type { CapabilityDescriptor, CapabilityDescriptorKind, CapabilityDescriptorSource } from "./domain/descriptorRegistry";
export {
  getCapabilityDescriptor,
  getCapabilityDescriptors,
  getCapabilityDescriptorKeys,
  hasCapabilityDescriptor,
  registerCapabilityDescriptor,
  unregisterCapabilityDescriptor,
  clearCapabilityDescriptors,
  setDescriptorWarnOnOverwrite,
} from "./domain/descriptorRegistry";
export type {
  CapabilityContract,
  CapabilityCompatibilityResult,
} from "./domain/contracts";
export {
  getCapabilityContract,
  getCapabilityContracts,
  registerCapabilityContract,
  unregisterCapabilityContract,
} from "./domain/contracts";
export { useContextHubOverridesStore } from "./stores/contextHubOverridesStore";
export { useContextHubSettingsStore } from "./stores/contextHubSettingsStore";
export type {
  UnifiedCapabilityEntry,
  UnifiedCapabilityKind,
  UnifiedCapabilitySource,
  UnifiedCapabilityOptions,
} from "./hooks";
export { useUnifiedCapabilities, useUnifiedCapability } from "./hooks";

// UI-specific types only - import core types from @pixsim7/shared.capabilities.core
export type {
  CapabilityRegistry,
  CapabilityConsumption,
  EntityScopedCapability,
} from "./types";

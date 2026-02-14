export { ContextHubHost } from "./components/ContextHubHost";
export { useContextHubState, useContextHubHostId } from "./hooks/contextHubContext";
export type { ContextHubState } from "./hooks/contextHubContext";
export { useCapability, useProvideCapability, usePanelContext } from "./hooks";
export { useProjectContext } from "./hooks";
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
  CAP_SCENE_VIEW,
} from "./domain/capabilities";
export {
  APP_ACTION_KEY_PREFIX,
  APP_STATE_KEY_PREFIX,
  getAppActionCapabilityKey,
  getAppStateCapabilityKey,
} from "@pixsim7/shared.capabilities.core/bridge";
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
export type {
  SceneViewOffer as SceneViewCapabilityOffer,
  SceneViewRequirement as SceneViewCapabilityRequirement,
} from "./domain/contracts/sceneView";
export { sceneViewContract } from "./domain/contracts/sceneView";
export type {
  CapabilityDescriptor,
  CapabilityDescriptorKind,
  CapabilityDescriptorSource,
} from "@pixsim7/shared.capabilities.core/descriptor";
export {
  getCapabilityDescriptor,
  getCapabilityDescriptors,
  getCapabilityDescriptorKeys,
  hasCapabilityDescriptor,
  registerCapabilityDescriptor,
  unregisterCapabilityDescriptor,
  clearCapabilityDescriptors,
  setDescriptorWarnOnOverwrite,
} from "@pixsim7/shared.capabilities.core/descriptor";
export type {
  CapabilityContract,
  CapabilityCompatibilityResult,
} from "@pixsim7/shared.capabilities.core/contract";
export {
  getCapabilityContract,
  getCapabilityContracts,
  registerCapabilityContract,
  unregisterCapabilityContract,
} from "@pixsim7/shared.capabilities.core/contract";
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

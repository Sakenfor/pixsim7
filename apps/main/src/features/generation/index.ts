/**
 * Generation Feature
 *
 * UI and logic for generation workbench, history, queue management,
 * and WebSocket-based generation status tracking.
 */

import * as Generation from '@pixsim7/shared.generation.core';

// Models - Internal camelCase types
export type {
  OperationType,
  GenerationStatus,
  EmbeddedRef,
  GenerationModel,
  CreatePendingGenerationOptions,
} from './models';
export {
  getGenerationModelName,
  fromGenerationResponse,
  fromGenerationResponses,
  isTerminalStatus,
  isActiveStatus,
  getStatusLabel,
  createPendingGeneration,
} from './models';

// Components
export { GenerationHistoryButton } from './components/GenerationHistoryButton';
export type { GenerationHistoryButtonProps } from './components/GenerationHistoryButton';
export { GenerationsPanel } from './components/GenerationsPanel';
export type { GenerationsPanelProps } from './components/GenerationsPanel';
export { GenerationSettingsPanel } from './components/GenerationSettingsPanel';
export type { GenerationSettingsPanelProps } from './components/GenerationSettingsPanel';
export { AdvancedSettingsPopover } from './components/AdvancedSettingsPopover';
export { PresetSelector } from './components/PresetSelector';
export type { PresetSelectorProps } from './components/PresetSelector';
export { GenerationSourceToggle } from './components/GenerationSourceToggle';
export type { GenerationSourceToggleProps } from './components/GenerationSourceToggle';
export { ViewerAssetInputProvider } from './components/ViewerAssetInputProvider';
export type { ViewerAssetInputProviderProps } from './components/ViewerAssetInputProvider';
export { QuickGenPanelHost, QUICKGEN_PANEL_IDS, QUICKGEN_PRESETS } from './components/QuickGenPanelHost';
export type { QuickGenPanelHostProps, QuickGenPanelHostRef, QuickGenSlot, QuickGenPreset } from './components/QuickGenPanelHost';
export { QuickGenWidget } from './components/QuickGenWidget';
export type { QuickGenWidgetProps, QuickGenWidgetRenderContext } from './components/QuickGenWidget';
export { ContentModerationWarning } from './components/ContentModerationWarning';
export type { ContentModerationWarningProps } from './components/ContentModerationWarning';
export { NotificationTicker } from './components/NotificationTicker';

// Hooks
export { useGenerationDevController } from './hooks/useGenerationDevController';
export { useGenerationStatus } from './hooks/useGenerationStatus';
export { useGenerationWebSocket } from './hooks/useGenerationWebSocket';
export { useGenerationWorkbench } from './hooks/useGenerationWorkbench';
export { useMediaCardGenerationStatus } from './hooks/useMediaCardGenerationStatus';
export { useMediaGenerationActions } from './hooks/useMediaGenerationActions';
export { useRecentGenerations } from './hooks/useRecentGenerations';
export { useGenerationScopeStores, GenerationScopeProvider } from './hooks/useGenerationScope';
export { useGenerationPresets } from './hooks/useGenerationPresets';
export type { UseGenerationPresetsResult } from './hooks/useGenerationPresets';
export { useProvideGenerationWidget } from './hooks/useProvideGenerationWidget';
export type { UseProvideGenerationWidgetConfig } from './hooks/useProvideGenerationWidget';
export { GenerationCapableHost } from './components/GenerationCapableHost';
export type { GenerationCapableHostProps } from './components/GenerationCapableHost';
export { useQuickGenPanelLayout } from './hooks/useQuickGenPanelLayout';
export type { UseQuickGenPanelLayoutConfig } from './hooks/useQuickGenPanelLayout';
export { useQuickGenScopeSync } from './hooks/useQuickGenScopeSync';
export type { UseQuickGenScopeSyncConfig, UseQuickGenScopeSyncResult } from './hooks/useQuickGenScopeSync';
export { usePersistedScopeState } from './hooks/usePersistedScopeState';

// Stores
export { useGenerationInputStore, getInputsForOperation } from './stores/generationInputStore';
export type { GenerationInputsState, InputItem, InputMaskLayer, AddInputOptions, OperationInputs, AssetSetSlotRef, PickStrategy } from './stores/generationInputStore';
export { useGenerationSettingsStore, createGenerationSettingsStore } from './stores/generationSettingsStore';
export {
  createGenerationSessionStore,
  DEFAULT_SESSION_FIELDS,
} from './stores/generationSessionStore';
export type {
  GenerationSessionFields,
  GenerationSessionActions,
  GenerationSessionState,
  GenerationSessionStoreHook,
} from './stores/generationSessionStore';
export { getGenerationSessionStore, getGenerationSettingsStore, getGenerationInputStore, getRegisteredInputStores, getRegisteredSettingsStores, pruneStaleGenerationStores } from './stores/generationScopeStores';
export {
  useGenerationsStore,
  generationsSelectors,
  isGenerationTerminal,
  isGenerationActive,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES
} from './stores/generationsStore';
export type { GenerationsState, GenerationStatus } from './stores/generationsStore';
export { useGenerationPresetStore } from './stores/generationPresetStore';
export type {
  GenerationPreset,
  PresetInputRef,
  PresetSnapshot,
  GenerationPresetState,
  GenerationPresetActions,
} from './stores/generationPresetStore';
export { useFanoutPresetStore } from './stores/fanoutPresetStore';
export { useGenerationHistoryStore } from './stores/generationHistoryStore';
export type {
  AssetHistoryEntry,
  GenerationHistoryState,
  HistoryMode,
  HistorySortMode,
} from './stores/generationHistoryStore';
// Lib - Generation Core
export type {
  AssetInput,
  AssetResolutionRequest,
  AssetResolutionResult,
  GenerationStatusConfig,
} from './lib/core';
export {
  hasAssetIdParams,
  extractAssetInput,
  resolveAssetsForAction,
  resolveSingleAsset,
  createRequestFromActionBlock,
  GENERATION_STATUS_CONFIG,
  getStatusConfig,
  getStatusTextColor,
  getStatusContainerClasses,
  getStatusBadgeClasses,
} from './lib/core';

// Lib - Combination Strategies
export {
  EACH_STRATEGIES,
  SET_STRATEGIES,
  ALL_STRATEGIES,
  computeCombinations,
  computeSetCombinations,
  isSetStrategy,
} from './lib/combinationStrategies';
export type { EachStrategy, SetStrategy, CombinationStrategy } from './lib/combinationStrategies';

// Lib - Canonical run-context contract
export {
  createGenerationRunDescriptor,
  createGenerationRunItemContext,
} from './lib/runContext';
export type {
  GenerationRunMode,
  GenerationRunContext,
  GenerationRunDescriptor,
  GenerationRunItemDescriptor,
  ResolvedGenerationRunDescriptor,
} from './lib/runContext';

// Lib - Sequential execution core (frontend orchestration primitive)
export {
  SEQUENTIAL_TERMINAL_GENERATION_STATUSES,
  SequentialStepTimeoutError,
  waitForGenerationTerminal,
  executeSequentialSteps,
  createSequentialStepRunContextMetadata,
} from './lib/sequentialExecutor';
export type {
  SequentialTerminalGenerationStatus,
  SequentialGenerationTerminalResult,
  WaitForGenerationTerminalOptions,
  SequentialExecutionStepStatus,
  SequentialExecutionStepDefinition,
  SequentialExecutionStepRecord,
  SequentialExecutionResult,
  SequentialSubmitStepResult,
  SequentialStepExecutionContext,
  ExecuteSequentialStepsOptions,
  SequentialStepRunContextMetadataInput,
} from './lib/sequentialExecutor';

// Lib - Multi-Asset Mode
export {
  resolveDisplayAssets,
  buildFallbackAsset,
} from './lib/multiAssetMode';
export type {
  DisplayAssetsParams,
  SelectedAssetLike,
} from './lib/multiAssetMode';

// Lib - Generation Types (from @pixsim7/shared.generation.core)
export type {
  GenerationStrategy,
  GenerationSocialContext,
  SceneSnapshot,
  PlayerContextSnapshot,
  DurationRule,
  ConstraintSet,
  StyleRules,
  FallbackConfig,
  GenerationNodeConfig,
  GenerationHealthStatus,
  GenerationNode,
  GenerationEdgeMeta,
  GenerateContentRequest,
  GeneratedContentMetadata,
  GeneratedContentPayload,
  GenerateContentResponse,
  GenerationValidationResult,
  NpcResponseParams,
  NpcResponseContent,
  CacheKeyComputeFn,
} from '@pixsim7/shared.generation.core';
export { registerGenerationScopes } from './lib/registerGenerationScopes';

// Namespace export for generation types
export { Generation };

/**
 * Generation Feature
 *
 * UI and logic for generation workbench, history, queue management,
 * and WebSocket-based generation status tracking.
 */

// Models - Internal camelCase types
export * from './models';

// Components
export { GenerationWorkbench } from './components/GenerationWorkbench';
export type {
  GenerationWorkbenchProps,
  WorkbenchRenderContext,
} from './components/GenerationWorkbench';
export { GenerationHistoryButton } from './components/GenerationHistoryButton';
export type { GenerationHistoryButtonProps } from './components/GenerationHistoryButton';
export { GenerationsPanel } from './components/GenerationsPanel';
export type { GenerationsPanelProps } from './components/GenerationsPanel';
export { GenerationSettingsPanel } from './components/GenerationSettingsPanel';
export type { GenerationSettingsPanelProps } from './components/GenerationSettingsPanel';
export { GenerationSourceToggle } from './components/GenerationSourceToggle';
export type { GenerationSourceToggleProps } from './components/GenerationSourceToggle';
export { ViewerAssetInputProvider } from './components/ViewerAssetInputProvider';
export type { ViewerAssetInputProviderProps } from './components/ViewerAssetInputProvider';
export { QuickGenPanelHost, QUICKGEN_PANEL_IDS, QUICKGEN_PRESETS } from './components/QuickGenPanelHost';
export type { QuickGenPanelHostProps, QuickGenPanelHostRef } from './components/QuickGenPanelHost';

// Hooks
export { useGenerationDevController } from './hooks/useGenerationDevController';
export { useGenerationStatus } from './hooks/useGenerationStatus';
export { useGenerationWebSocket } from './hooks/useGenerationWebSocket';
export { useGenerationWorkbench } from './hooks/useGenerationWorkbench';
export { useMediaCardGenerationStatus } from './hooks/useMediaCardGenerationStatus';
export { useMediaGenerationActions } from './hooks/useMediaGenerationActions';
export { useRecentGenerations } from './hooks/useRecentGenerations';
export { useGenerationScopeStores, GenerationScopeProvider } from './hooks/useGenerationScope';

// Stores
export { useGenerationQueueStore, getQueueForOperation } from './stores/generationQueueStore';
export type { GenerationQueueState, QueuedAsset, EnqueueOptions, InputMode } from './stores/generationQueueStore';
export { useGenerationSettingsStore, createGenerationSettingsStore } from './stores/generationSettingsStore';
export { createGenerationSessionStore } from './stores/generationSessionStore';
export { getGenerationSessionStore, getGenerationSettingsStore, getGenerationQueueStore } from './stores/generationScopeStores';
export {
  useGenerationsStore,
  generationsSelectors,
  isGenerationTerminal,
  isGenerationActive,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES
} from './stores/generationsStore';
export type { GenerationsState, GenerationStatus } from './stores/generationsStore';
// Lib - Generation Core
export * from './lib/core';

// Lib - Multi-Asset Mode
export {
  resolveInputMode,
  resolveDisplayAssets,
  buildFallbackAsset,
} from './lib/multiAssetMode';
export type {
  InputModeParams,
  InputModeResult,
  DisplayAssetsParams,
  SelectedAssetLike,
} from './lib/multiAssetMode';

// Lib - Generation Types (from @shared/types)
export * from './lib/generationTypes';
export { registerGenerationScopes } from './lib/registerGenerationScopes';

// Namespace export for generation types
export * as Generation from './lib/generationTypes';

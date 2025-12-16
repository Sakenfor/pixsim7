/**
 * Generation Feature
 *
 * UI and logic for generation workbench, history, queue management,
 * and WebSocket-based generation status tracking.
 */

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

// Hooks
export { useGenerationDevController } from './hooks/useGenerationDevController';
export { useGenerationStatus } from './hooks/useGenerationStatus';
export { useGenerationWebSocket } from './hooks/useGenerationWebSocket';
export { useGenerationWorkbench } from './hooks/useGenerationWorkbench';
export { useMediaCardGenerationStatus } from './hooks/useMediaCardGenerationStatus';
export { useMediaGenerationActions } from './hooks/useMediaGenerationActions';
export { useRecentGenerations } from './hooks/useRecentGenerations';

// Stores
export { useGenerationQueueStore } from './stores/generationQueueStore';
export type { GenerationQueueState, QueuedAsset } from './stores/generationQueueStore';
export { useGenerationSettingsStore } from './stores/generationSettingsStore';
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

// Lib - Generation Types (from @shared/types)
export * from './lib/generationTypes';

// Namespace export for generation types
export * as Generation from './lib/generationTypes';

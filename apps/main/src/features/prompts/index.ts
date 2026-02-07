/**
 * Prompts Feature Module
 *
 * Prompt/generation workbench - inspection, editing, quick generation controls.
 *
 * @example
 * ```typescript
 * // Import from barrel
 * import {
 *   PromptCandidatesViewer,
 *   usePromptInspection,
 *   useQuickGenerateController
 * } from '@features/prompts';
 *
 * // Or import specific modules
 * import { buildGenerationRequest } from '@features/generation/lib/quickGenerateLogic';
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export * from './types';

// ============================================================================
// Components
// ============================================================================

export {
  PromptCandidatesViewer,
  type PromptCandidatesViewerProps,
} from './components/PromptBlocksViewer';

export {
  PromptInlineViewer,
  PromptCandidateList,
  type PromptInlineViewerProps,
  type PromptCandidateListProps,
  type PromptCandidateDisplay,
} from './components/PromptInlineViewer';

export {
  PromptComposer,
  type PromptComposerProps,
} from './components/PromptComposer';

// ============================================================================
// Hooks
// ============================================================================

export {
  usePromptInspection,
  type UsePromptInspectionOptions,
  type PromptInspectionState,
} from './hooks/usePromptInspection';

export {
  usePromptAiEdit,
  type PromptEditRequest,
  type PromptEditResponse,
  type PromptAiEditState,
} from './hooks/usePromptAiEdit';

export {
  useQuickGenerateBindings,
  type QuickGenerateBindings,
} from './hooks/useQuickGenerateBindings';

export { useQuickGenerateController } from '@features/generation/hooks/useQuickGenerateController';

// ============================================================================
// Library - Generation Logic
// ============================================================================

export {
  buildGenerationRequest,
  type QuickGenerateContext,
  type BuildGenerationResult,
} from '@features/generation/lib/quickGenerateLogic';

// ============================================================================
// Stores
// ============================================================================

export { usePromptSettingsStore } from './stores/promptSettingsStore';

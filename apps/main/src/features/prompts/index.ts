/**
 * Prompts Feature Module
 *
 * Prompt/generation workbench - inspection, editing, quick generation controls.
 *
 * @example
 * ```typescript
 * // Import from barrel
 * import {
 *   PromptSegmentsViewer,
 *   usePromptInspection,
 *   useQuickGenerateController
 * } from '@features/prompts';
 *
 * // Or import specific modules
 * import { buildGenerationRequest } from '@features/prompts/lib/quickGenerateLogic';
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
  PromptSegmentsViewer,
  type PromptSegmentsViewerProps,
} from './components/PromptBlocksViewer';

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

export { useQuickGenerateController } from './hooks/useQuickGenerateController';

// ============================================================================
// Library - Generation Logic
// ============================================================================

export {
  buildGenerationRequest,
  type QuickGenerateContext,
  type BuildGenerationResult,
} from './lib/quickGenerateLogic';

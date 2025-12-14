/**
 * Interactions Feature Module
 *
 * NPC interaction UI components + intimacy domain logic.
 *
 * **Architecture Note:**
 * - The canonical interaction **contract** lives in `@shared/types/interactions.ts`
 * - This feature provides **UI components** and **intimacy domain logic**
 * - We re-export the contract for convenience (single source of truth maintained)
 *
 * See: `apps/main/src/features/interactions/README.md` for architecture details
 *
 * @example
 * ```typescript
 * // ✅ RECOMMENDED - Import everything from feature (convenient)
 * import {
 *   InteractionMenu,          // UI component
 *   NpcInteractionSurface,    // Contract type (re-exported from @shared/types)
 *   Intimacy                  // Domain logic
 * } from '@features/interactions';
 *
 * // ✅ ALSO VALID - Import contract directly (explicit)
 * import { NpcInteractionDefinition } from '@shared/types';
 * ```
 */

// ============================================================================
// Contract Types (re-exported from @shared/types for convenience)
// ============================================================================

/**
 * Re-export canonical interaction contract from @shared/types
 *
 * This allows UI code to import both components and contract types from the feature:
 * `import { InteractionMenu, NpcInteractionSurface } from '@features/interactions'`
 *
 * Source of truth: @shared/types/interactions.ts
 */
export * from '@shared/types/interactions';

// ============================================================================
// Components - Core Interaction UI
// ============================================================================

export { InteractionMenu, InlineInteractionHint } from './components/InteractionMenu';
export type { InteractionMenuProps } from './components/InteractionMenu';

export { PendingDialoguePanel } from './components/PendingDialoguePanel';
export type { PendingDialoguePanelProps } from './components/PendingDialoguePanel';

export { InteractionHistory, responseToHistoryEntry } from './components/InteractionHistory';
export type {
  InteractionHistoryProps,
  InteractionHistoryEntry,
} from './components/InteractionHistory';

export { ChainProgress, ChainList } from './components/ChainProgress';
export type { ChainProgressProps } from './components/ChainProgress';

export { InteractionSuggestions } from './components/InteractionSuggestions';
export type { InteractionSuggestionsProps } from './components/InteractionSuggestions';

export { MoodIndicator } from './components/MoodIndicator';
export type { MoodIndicatorProps } from './components/MoodIndicator';

// ============================================================================
// Components - Editor
// ============================================================================

export { InteractionEditor } from './components/editor/InteractionEditor';
export type { InteractionEditorProps } from './components/editor/InteractionEditor';

export { TemplateSelector } from './components/editor/TemplateSelector';
export type { TemplateSelectorProps } from './components/editor/TemplateSelector';

// ============================================================================
// Lib - Intimacy (from @shared/types migration)
// ============================================================================

// Named exports for backward compatibility
export * from './lib/intimacy/types';
export * from './lib/intimacy/nodeTypes';

// Namespace export (recommended pattern)
export * as Intimacy from './lib/intimacy/types';

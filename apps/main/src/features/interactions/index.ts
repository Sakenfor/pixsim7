/**
 * Interactions Feature Module
 *
 * NPC interaction UI components - menus, suggestions, history, and visual editors.
 *
 * @example
 * ```typescript
 * // Import from barrel
 * import { InteractionMenu, InteractionHistory, MoodIndicator } from '@features/interactions';
 *
 * // Or import specific modules
 * import { InteractionEditor } from '@features/interactions/components/editor/InteractionEditor';
 * ```
 */

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

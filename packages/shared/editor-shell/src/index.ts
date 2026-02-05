/**
 * @pixsim7/shared.editor-shell
 *
 * Shared infrastructure for graph-based editors.
 *
 * This package provides reusable components, stores, and factories
 * for building visual graph editors like:
 * - Arc Graph Editor
 * - Scene Graph Editor
 * - Routine Graph Editor
 *
 * @example
 * ```typescript
 * import {
 *   createEditorStore,
 *   createSelectionStore,
 *   EditorShell,
 *   EditorToolbar,
 *   GraphSelector,
 * } from '@pixsim7/shared.editor-shell';
 *
 * // Create stores
 * const useMyStore = createEditorStore({
 *   name: 'my-editor',
 *   graphIdPrefix: 'my',
 *   createDefaultGraph: (name) => ({ ... }),
 * });
 *
 * // Use components
 * function MyEditor() {
 *   return (
 *     <EditorShell sidebar={<Inspector />}>
 *       <GraphSurface />
 *     </EditorShell>
 *   );
 * }
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Base types
  BaseGraph,
  Position,

  // Store types
  EditorDataState,
  EditorDataActions,
  EditorStore,
  StoreWithTemporal,

  // Selection types
  SelectionState,
  SelectionActions,
  SelectionStore,

  // Component types
  EditorShellLayout,
  EditorShellProps,
  EditorToolbarProps,

  // Factory types
  EditorFeatureConfig,
  EditorFeatureResult,

  // Utility types
  NodeOf,
  EdgeOf,
  PartializeFn,
} from './types';

// ============================================================================
// Stores
// ============================================================================

export {
  // Editor store factory
  createEditorStore,
  createEditorSelectors,
  createTemporalSelectors,
  createTemporalHooks,
  type CreateEditorStoreConfig,

  // Selection store factory
  createSelectionStore,
  createSelectionSelectors,
  createNodeSelectionHook,
  type CreateSelectionStoreConfig,
} from './stores';

// ============================================================================
// Components
// ============================================================================

export {
  // Main shell
  EditorShell,
  EditorEmptyState,
  SidebarSection,
  PropertyField,

  // Toolbar
  EditorToolbar,
  ToolbarButton,
  ToolbarDivider,
  ToolbarGroup,
  DirtyIndicator,

  // Graph selector
  GraphSelector,
  GraphSelectorCompact,
  type GraphItem,
  type GraphSelectorProps,
} from './components';

// ============================================================================
// Factories
// ============================================================================

export {
  createEditorFeature,
  createLazyRoute,
  createRouteWrapper,
  createNodeActions,
  createEdgeActions,
} from './factories';

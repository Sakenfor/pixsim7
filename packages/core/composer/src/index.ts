/**
 * Composer Core
 *
 * Framework-agnostic composition model and helpers.
 */

export {
  validateComposition,
  createComposition,
  addBlock,
  removeBlock,
  updateBlock,
  addDataSource,
  removeDataSource,
  exportComposition,
  importComposition,
  type PanelComposition,
  type GridLayout,
  type BlockInstance,
  type DataSourceType,
  type DataSourceDefinition,
  type DataSourceBinding,
  type PanelCompositionStyles,
  // Backward compatibility aliases
  addWidget,
  removeWidget,
  updateWidget,
  type WidgetInstance,
} from "./panelComposer";

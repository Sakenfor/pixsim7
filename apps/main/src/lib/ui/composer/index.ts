// Block Registry (composable panel building blocks)
export {
  BlockRegistry,
  blockRegistry,
  type BlockDefinition,
  type BlockType,
  type BlockProps,
  type BlockConfigSchema,
  // Backward compatibility aliases
  type WidgetDefinition,
  WidgetRegistry,
  widgetRegistry,
} from './blockRegistry';

// Panel Composer (grid-based panel layouts)
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
  // Backward compatibility aliases
  addWidget,
  removeWidget,
  updateWidget,
  type WidgetInstance,
} from './panelComposer';

// Components
export { ComposedPanel, useAvailableBlocks, useAvailableDataSources } from './ComposedPanel';

// Built-in blocks
export { builtInBlocks, registerBuiltInBlocks, builtInWidgets, registerBuiltInWidgets } from './builtInBlocks';

// Initialization
export { initializeBlocks, areBlocksInitialized, initializeWidgets, areWidgetsInitialized } from './initializeBlocks';

// Demo compositions
export { demoCompositions } from './demoCompositions';

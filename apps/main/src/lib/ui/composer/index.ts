/**
 * Panel Composer System
 *
 * Grid-based panel layouts with composable blocks.
 *
 * NOTE: Block definitions have moved to `@lib/widgets`.
 * Use `registerAllWidgets()` or `registerBlockWidgets()` from `@lib/widgets` instead.
 */

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

// @deprecated - Block types moved to @lib/widgets
export {
  BlockRegistry,
  blockRegistry,
  type BlockDefinition,
  type BlockType,
  type BlockProps,
  type BlockConfigSchema,
  type WidgetDefinition,
  WidgetRegistry,
  widgetRegistry,
} from './blockRegistry';

// @deprecated - Use registerAllWidgets() from @lib/widgets instead
export { builtInBlocks, registerBuiltInBlocks, builtInWidgets, registerBuiltInWidgets } from './builtInBlocks';

// @deprecated - Use registerAllWidgets() from @lib/widgets instead
export { initializeBlocks, areBlocksInitialized, initializeWidgets, areWidgetsInitialized } from './initializeBlocks';

// Demo compositions
export { demoCompositions } from './demoCompositions';

export {
  WidgetRegistry,
  widgetRegistry,
  type WidgetDefinition,
} from './widgetRegistry';

export {
  validateComposition,
  createComposition,
  addWidget,
  removeWidget,
  updateWidget,
  addDataSource,
  removeDataSource,
  exportComposition,
  importComposition,
  type PanelComposition,
  type GridLayout,
  type WidgetInstance,
} from './panelComposer';

export { ComposedPanel } from './ComposedPanel';
export { builtInWidgets } from './builtInWidgets';
export { initializeWidgets } from './initializeWidgets';
export { demoCompositions } from './demoCompositions';

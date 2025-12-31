/**
 * Widget Storage Module
 *
 * Storage abstractions for widget configurations.
 */

export {
  // Types
  type WidgetSurfaceType,
  type WidgetBuilderConfig,
  type WidgetBuilderStorage,
  type StorageType,
  // Implementations
  LocalStorageWidgetBuilderStorage,
  IndexedDBWidgetBuilderStorage,
  APIWidgetBuilderStorage,
  // Factory
  createWidgetBuilderStorage,
  // Default instance
  widgetBuilderStorage,
} from './widgetBuilderStorage';

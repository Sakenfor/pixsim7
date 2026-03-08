export type {
  PositionMode,
  UnifiedAnchor,
  UnifiedRegion,
  UnifiedOffset,
  UnifiedPosition,
  SimpleVisibilityTrigger,
  AdvancedVisibilityCondition,
  UnifiedVisibility,
  UnifiedStyle,
  UnifiedDataBinding,
  UnifiedWidgetConfig,
  UnifiedSurfaceConfig,
} from './unifiedConfig';

export type { DataBindingKind, DataBinding } from './dataBinding';

export {
  resolveDataBinding,
  resolveDataBindings,
  createDataBindingResolver,
  createBindingFromValue,
} from './dataBindingResolver';

export {
  fromUnifiedBinding,
  toUnifiedBinding,
  fromUnifiedBindings,
  toUnifiedBindings,
  isSerializable,
  filterSerializableBindings,
} from './bindingAdapters';

export { useUndoRedo } from './hooks/useUndoRedo';
export type { UndoRedoState, UndoRedoControls, UseUndoRedoOptions } from './hooks/useUndoRedo';

export { resolvePath } from './utils/propertyPath';

export { PresetManager, LocalStoragePresetStorage, createPresetManager } from './presets';
export type { BasePreset, ConfigPreset, PresetStorage, PresetManagerOptions } from './presets';

// Widget registry moved to @lib/widgets
// Use: import { widgetRegistry, registerWidget } from '@lib/widgets';

/**
 * Dockview Context Menu System
 *
 * Barrel export for context menu functionality.
 * Pure re-exports from shared packages + app-specific modules.
 */

// App-specific modules
export * from './types';
export * from './ContextMenuProvider';
export * from './DockviewContextMenu';
export * from './PanelPropertiesPopup';
export * from './CustomTabComponent';
export * from './DockviewIdContext';
export * from './capabilityHelpers';
export * from './buildDockviewContext';
export * from './resolveCurrentDockview';

// Auto-context presets (app-specific registrations)
export * from './autoContextPresets';

// Actions - import to register with the global registry
export * from './actions';
export { registerContextMenuActions } from './actions';

// Re-exports from shared context-menu package
export { ContextMenuRegistry, contextMenuRegistry } from '@pixsim7/shared.ui.context-menu';
export { useContextMenu, useContextMenuOptional } from '@pixsim7/shared.ui.context-menu';
export {
  useComponentContextMenu,
  type UseComponentContextMenuOptions,
  type ComponentContextMenuResult,
} from '@pixsim7/shared.ui.context-menu';
export {
  contextDataRegistry,
  contextDataCache,
  contextMenuAttrs,
  contextMenuIgnore,
  extractContextFromElement,
  useRegisterContextData,
  useContextMenuItem,
  type ContextDataResolver,
  type ContextMenuAttrs,
} from '@pixsim7/shared.ui.context-menu';
export {
  autoContextConfigRegistry,
  useAutoContextMenu,
  useAssetAutoContextMenu,
  usePromptAutoContextMenu,
  type AutoContextConfig,
} from '@pixsim7/shared.ui.context-menu';
export { toMenuAction, toMenuActions, menuActionsToCapabilityActions, type ToMenuActionOptions } from '@pixsim7/shared.ui.context-menu';
export {
  ContextMenuReactContext as ContextMenuContext,
  type ContextMenuContextValue,
} from '@pixsim7/shared.ui.context-menu';

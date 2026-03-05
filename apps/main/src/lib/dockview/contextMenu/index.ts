/**
 * Dockview Context Menu System
 *
 * Barrel export for context menu functionality.
 * Pure re-exports from shared packages + app-specific modules.
 */

// Side-effect import: registers auto-context presets at module load.
import './autoContextPresets';

// App-specific modules
export type {
  ContextMenuContextBase,
  MenuActionContextBase,
  MenuActionBase,
  ContextMenuContext,
  MenuItem,
  PanelRegistryLike,
  MenuActionContext,
  MenuAction,
} from './types';
export type { DockviewLayout } from './ContextMenuProvider';
export type { AppContextMenuServices } from './ContextMenuProvider';
export { ContextMenuProvider } from './ContextMenuProvider';
export { ContextMenuPortal } from './DockviewContextMenu';
export {
  usePropertiesPopupStore,
  PropertiesPopup,
  PanelPropertiesPopup,
} from './PanelPropertiesPopup';
export { CustomTabComponent } from './CustomTabComponent';
export {
  DockviewIdProvider,
  useDockviewId,
  useDockviewContext,
} from './DockviewIdContext';
export {
  getCapability,
  hasCapability,
  getRegistryChain,
  getAllProviders,
  resolveProvider,
  hasLiveState,
} from './capabilityHelpers';
export type { RegistryScope, ProviderEntry } from './capabilityHelpers';
export type { DockviewContextBase, DockviewContextOverrides } from './buildDockviewContext';
export { buildDockviewContext } from './buildDockviewContext';
export { resolveCurrentDockview, resolveCurrentDockviewApi } from './resolveCurrentDockview';

// Actions - import to register with the global registry
export type { LayoutPreset, PresetScope } from './actions';
export {
  closePanelAction,
  maximizePanelAction,
  restorePanelAction,
  floatPanelAction,
  pinTabAction,
  unpinTabAction,
  focusPanelAction,
  propertiesAction,
  panelPropertiesAction,
  closeOtherPanelsAction,
  closeAllInGroupAction,
  panelActionDefinitions,
  registerPanelActionCapabilities,
  panelActions,
  splitRightAction,
  splitDownAction,
  moveToNewGroupAction,
  joinLeftGroupAction,
  joinRightGroupAction,
  splitPanelAction,
  movePanelAction,
  layoutActions,
  getScopeLabel,
  savePresetAction,
  loadPresetAction,
  deletePresetAction,
  resetLayoutAction,
  presetActionDefinitions,
  registerPresetActionCapabilities,
  presetActions,
  getDefaultScopePanelSubmenu,
  addPanelAction,
  getQuickAddActions,
  getEditQuickAddActions,
  quickAddActions,
  quickAddActionDefinitions,
  registerQuickAddActionCapabilities,
  addPanelActions,
  assetActions,
  contextHubActions,
  cubeActions,
  debugActions,
  allActions,
  registerContextMenuActions,
} from './actions';

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

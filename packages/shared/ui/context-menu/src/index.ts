/**
 * @pixsim7/shared.ui.context-menu
 *
 * Shared context menu infrastructure for dockview-based applications.
 */

// Base infrastructure
export { BaseRegistry, type Identifiable } from './BaseRegistry';

// Types
export type {
  ContextMenuContext,
  ContextMenuHistoryProvider,
  MenuActionContextBase,
  MenuActionBase,
  MenuItem,
  CapabilityActionSource,
  CapabilityActionLike,
  CapabilitiesSnapshotProvider,
  PanelRegistryLike,
} from './types';

// Registry
export { ContextMenuRegistry, contextMenuRegistry } from './ContextMenuRegistry';

// Provider
export { ContextMenuProvider } from './ContextMenuProvider';
export type { ContextMenuServices, DockviewLayout } from './ContextMenuProvider';

// Context
export { ContextMenuContext as ContextMenuReactContext } from './ContextMenuContext';
export type { ContextMenuContextValue } from './ContextMenuContext';

// Hooks
export { useContextMenu, useContextMenuOptional } from './useContextMenu';
export { useComponentContextMenu } from './useComponentContextMenu';
export type {
  UseComponentContextMenuOptions,
  ComponentContextMenuResult,
} from './useComponentContextMenu';

// Context Menu Portal
export { ContextMenuPortal } from './DockviewContextMenu';
export type { ContextMenuPortalProps, RenderIconFn } from './DockviewContextMenu';

// Dockview ID Context
export { DockviewIdProvider, useDockviewId, useDockviewContext } from './DockviewIdContext';

// Context Data Resolver
export {
  contextDataRegistry,
  contextDataCache,
  contextMenuAttrs,
  contextMenuIgnore,
  extractContextFromElement,
  useRegisterContextData,
  useContextMenuItem,
} from './contextDataResolver';
export type { ContextDataResolver, ContextMenuAttrs } from './contextDataResolver';

// Auto Context Menu
export {
  autoContextConfigRegistry,
  useAutoContextMenu,
  useAssetAutoContextMenu,
  usePromptAutoContextMenu,
} from './autoContextMenu';
export type { AutoContextConfig } from './autoContextMenu';

// Action Adapters
export { toMenuAction, toMenuActions, menuActionsToCapabilityActions } from './actionAdapters';
export type { ToMenuActionOptions, MenuActionCapabilityOptions, MenuActionCapabilityMapping } from './actionAdapters';

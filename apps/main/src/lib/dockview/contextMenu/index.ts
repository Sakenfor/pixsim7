/**
 * Dockview Context Menu System
 *
 * Barrel export for context menu functionality.
 */

export * from './types';
export * from './ContextMenuRegistry';
export * from './ContextMenuProvider';
export * from './useContextMenu';
export * from './DockviewContextMenu';
export * from './PanelPropertiesPopup';
export * from './CustomTabComponent';
export * from './DockviewIdContext';
export * from './useComponentContextMenu';
export * from './contextDataResolver';
export * from './capabilityHelpers';
export * from './buildDockviewContext';
export * from './resolveCurrentDockview';
export { contextMenuRegistry } from './ContextMenuRegistry';

// Auto-context menu system
export * from './autoContextMenu';
export * from './autoContextPresets';

// Actions - import to register with the global registry
export * from './actions';
export { registerContextMenuActions } from './actions';

// Action adapters for converting canonical ActionDefinition to MenuAction
export { toMenuAction, toMenuActions, type ToMenuActionOptions } from './actionAdapters';

/**
 * Dockview Context Menu System
 *
 * Barrel export for context menu functionality.
 */

export * from './types';
export * from './ContextMenuRegistry';
export * from './ContextMenuContext';
export * from './ContextMenuProvider';
export * from './useContextMenu';
export * from './DockviewContextMenu';
export * from './PanelPropertiesPopup';
export * from './CustomTabComponent';
export * from './DockviewIdContext';
export * from './useComponentContextMenu';
export * from './contextDataResolver';
export * from './capabilityHelpers';
export { contextMenuRegistry } from './ContextMenuRegistry';

// Auto-context menu system
export * from './autoContextMenu';
export * from './autoContextPresets';

// Actions - import to register with the global registry
export * from './actions';
export { registerContextMenuActions } from './actions';

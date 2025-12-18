/**
 * Smart Dockview
 *
 * Lightweight dockview infrastructure with:
 * - Local (feature-scoped) panel registries
 * - Smart tab visibility (tabs shown only when 2+ panels grouped)
 * - Layout persistence
 * - Minimal chrome styling
 */

export { SmartDockview } from './SmartDockview';
export type { SmartDockviewProps } from './SmartDockview';

export { LocalPanelRegistry, createLocalPanelRegistry } from './LocalPanelRegistry';

export { useSmartDockview } from './useSmartDockview';
export type { UseSmartDockviewOptions, UseSmartDockviewReturn } from './useSmartDockview';

export type {
  LocalPanelDefinition,
  PanelPosition,
  PanelSizeConstraints,
  SmartDockviewConfig,
  SmartDockviewLayout,
  SmartDockviewPanelProps,
} from './types';

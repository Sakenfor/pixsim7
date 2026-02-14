/**
 * Unified Plugin Descriptor
 *
 * Core schema for the canonical plugin metadata shape used across all systems.
 */

import type { PluginPermission } from './bundleApi';

/**
 * Canonical plugin origin - normalized from all source systems
 *
 * Legacy mapping:
 * - `plugins-dir` -> `plugin-dir`
 * - `dev` -> `dev-project`
 */
export type UnifiedPluginOrigin =
  | 'builtin'       // Core functionality shipped with the app
  | 'plugin-dir'    // User plugins from plugins/ directory
  | 'ui-bundle'     // Dynamically loaded UI plugins via PluginManager
  | 'dev-project';  // Development-time plugins

/**
 * Canonical plugin family - superset of all source systems
 *
 * Bundle families (`scene`, `ui`, `tool`, `control-center`) map to:
 * - `scene` -> `scene-view`
 * - `ui` -> `ui-plugin`
 * - `tool` -> `ui-plugin` (with bundleFamily='tool')
 * - `control-center` -> `control-center`
 */
export type UnifiedPluginFamily =
  | 'world-tool'
  | 'helper'
  | 'interaction'
  | 'gallery-tool'
  | 'brain-tool'
  | 'gallery-surface'
  | 'node-type'
  | 'renderer'
  | 'ui-plugin'
  | 'scene-view'
  | 'control-center'
  | 'graph-editor'
  | 'dev-tool'
  | 'workspace-panel'
  | 'dock-widget'
  | 'gizmo-surface'
  | 'panel-group'
  | 'generation-ui';

/**
 * Scene view specific metadata
 */
export interface SceneViewExtension {
  sceneViewId: string;
  surfaces?: Array<'overlay' | 'hud' | 'panel' | 'workspace'>;
  contentTypes?: string[];
  default?: boolean;
}

/**
 * Control center specific metadata
 */
export interface ControlCenterExtension {
  controlCenterId: string;
  displayName?: string;
  features?: string[];
  preview?: string;
  default?: boolean;
}

/**
 * Dock widget specific metadata
 */
export interface DockWidgetExtension {
  widgetId: string;
  dockviewId: string;
  presetScope?: string;
  panelScope?: string;
  storageKey?: string;
  allowedPanels?: string[];
  defaultPanels?: string[];
}

/**
 * Workspace panel specific metadata
 */
export interface WorkspacePanelExtension {
  panelId: string;
  category?: 'core' | 'development' | 'game' | 'tools' | 'custom';
  supportsCompactMode?: boolean;
  supportsMultipleInstances?: boolean;
}

/**
 * Gizmo surface specific metadata
 */
export interface GizmoSurfaceExtension {
  gizmoSurfaceId?: string;
  category?: 'scene' | 'world' | 'npc' | 'debug' | 'custom';
  supportsContexts?: Array<'scene-editor' | 'game-2d' | 'game-3d' | 'playground' | 'workspace' | 'hud'>;
}

/**
 * Family-specific extension metadata
 */
export interface FamilyExtensions {
  sceneView?: SceneViewExtension;
  controlCenter?: ControlCenterExtension;
  dockWidget?: DockWidgetExtension;
  workspacePanel?: WorkspacePanelExtension;
  gizmoSurface?: GizmoSurfaceExtension;
}

/**
 * Capability hints for feature plugins (legacy catalog)
 */
export interface UnifiedPluginCapabilities {
  modifiesSession?: boolean;
  modifiesInventory?: boolean;
  modifiesRelationships?: boolean;
  addsUIOverlay?: boolean;
  addsNodeTypes?: boolean;
  addsGalleryTools?: boolean;
  providerId?: string;
  triggersEvents?: boolean;
  hasRisk?: boolean;
  requiresItems?: boolean;
  consumesItems?: boolean;
  canBeDetected?: boolean;
  opensDialogue?: boolean;
}

/**
 * Unified Plugin Descriptor
 *
 * Canonical shape for plugin metadata across all systems:
 * - Frontend pluginSystem (PluginMetadata/ExtendedPluginMetadata)
 * - Frontend legacy catalog (PluginMeta)
 * - Frontend bundle manifests (PluginManifest/BundleManifest)
 * - Backend DTOs (PluginResponse/PluginInfo)
 *
 * This is the single source of truth for plugin metadata shape.
 * All systems should map to/from this type.
 */
export interface UnifiedPluginDescriptor {
  // ===== IDENTITY =====
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description */
  description?: string;
  /** Semantic version */
  version?: string;
  /** Plugin author */
  author?: string;
  /** Icon (emoji or URL) */
  icon?: string;

  // ===== CLASSIFICATION =====
  /** Plugin family (canonical) */
  family: UnifiedPluginFamily;
  /** Plugin origin (canonical) */
  origin: UnifiedPluginOrigin;
  /** Plugin type within family (ui-overlay, theme, tool, enhancement) */
  pluginType?: 'ui-overlay' | 'theme' | 'tool' | 'enhancement';
  /** Tags for filtering/searching */
  tags?: string[];
  /** Category for grouping/filtering (legacy catalog) */
  category?: string;

  // ===== FEATURE METADATA (legacy catalog) =====
  /** Capability hints for feature plugins */
  capabilities?: UnifiedPluginCapabilities;
  /** Features this plugin provides */
  providesFeatures?: string[];
  /** Features this plugin consumes */
  consumesFeatures?: string[];
  /** Actions this plugin consumes */
  consumesActions?: string[];
  /** State IDs this plugin consumes */
  consumesState?: string[];
  /** Plugin scope (node types) */
  scope?: 'scene' | 'arc' | 'world' | 'custom';
  /** Interaction UI mode */
  uiMode?: 'dialogue' | 'notification' | 'silent' | 'custom';
  /** Marked as experimental */
  experimental?: boolean;
  /** Marked as deprecated */
  deprecated?: boolean;
  /** Deprecation message */
  deprecationMessage?: string;
  /** Plugin ID this replaces */
  replaces?: string;
  /** Homepage/documentation URL */
  homepage?: string;
  /** Source repository URL */
  repository?: string;
  /** Plugin dependencies */
  dependencies?: string[];
  /** Optional plugin dependencies */
  optionalDependencies?: string[];
  /** Whether plugin has configurable settings */
  configurable?: boolean;

  // ===== PERMISSIONS & CAPABILITIES =====
  /** Required permissions */
  permissions?: PluginPermission[];
  /** Whether plugin can be disabled */
  canDisable: boolean;

  // ===== STATE =====
  /** Whether plugin is currently active */
  isActive: boolean;
  /** Whether this is a built-in plugin */
  isBuiltin: boolean;
  /** Timestamp when plugin was loaded (ms since epoch) */
  loadedAt?: number;

  // ===== BUNDLE INFO (for loadable plugins) =====
  /** URL to plugin bundle */
  bundleUrl?: string;
  /** URL to manifest.json */
  manifestUrl?: string;
  /** Original bundle family (scene, ui, tool, control-center) */
  bundleFamily?: 'scene' | 'ui' | 'tool' | 'control-center';

  // ===== FAMILY-SPECIFIC EXTENSIONS =====
  extensions?: FamilyExtensions;
}

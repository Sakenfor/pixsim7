/**
 * Core Plugin System Types
 *
 * Foundation for user-installable UI plugins.
 * Designed for safety: plugins can read state, add UI, but cannot modify game state.
 */

import type { GameSessionDTO, GameLocationDetail, NpcPresenceDTO, GameWorldDetail } from '../api/game';

/**
 * Plugin manifest - metadata about the plugin
 */
export interface PluginManifest {
  // Identity
  id: string;                    // Unique ID (e.g., "relationship-tracker")
  name: string;                  // Display name
  version: string;               // Semantic version (e.g., "1.0.0")
  author: string;                // Plugin author
  description: string;           // Short description
  icon?: string;                 // Icon URL or emoji
  tags?: string[];               // Tags for filtering/searching
  family: 'scene' | 'ui' | 'tool' | 'control-center'; // Plugin family classification

  // Compatibility
  minGameVersion?: string;       // Minimum game version required
  maxGameVersion?: string;       // Maximum game version supported

  // Type & behavior
  type: 'ui-overlay' | 'theme' | 'tool' | 'enhancement';

  // Permissions (what the plugin needs access to)
  permissions: PluginPermission[];

  // Entry point
  main: string;                  // Path to main plugin file (e.g., "index.js")

  // Dependencies (optional)
  dependencies?: Record<string, string>;  // Other plugins this depends on
}

/**
 * Permission types for plugins
 */
export type PluginPermission =
  | 'read:session'       // Read game session data
  | 'read:world'         // Read world state
  | 'read:npcs'          // Read NPC data
  | 'read:locations'     // Read location data
  | 'ui:overlay'         // Add UI overlays
  | 'ui:theme'           // Modify theme/CSS
  | 'storage'            // Local storage for plugin settings
  | 'notifications';     // Show notifications

/**
 * Plugin lifecycle states
 */
export type PluginState = 'disabled' | 'enabled' | 'error';

/**
 * Plugin metadata stored in registry
 */
export interface PluginEntry {
  manifest: PluginManifest;
  state: PluginState;
  error?: string;
  installedAt: number;
  enabledAt?: number;
  settings?: Record<string, unknown>;
}

/**
 * Game state snapshot exposed to plugins (read-only)
 */
export interface PluginGameState {
  // Session
  session: GameSessionDTO | null;
  flags: Record<string, unknown>;
  relationships: Record<string, unknown>;

  // World
  world: GameWorldDetail | null;
  worldTime: { day: number; hour: number };

  // Location
  currentLocation: GameLocationDetail | null;
  locationNpcs: NpcPresenceDTO[];

  // Future: inventory, quests, etc.
}

/**
 * UI elements that plugins can add
 */
export interface PluginOverlay {
  id: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  render: () => React.ReactNode;
  zIndex?: number;
}

export interface PluginMenuItem {
  id: string;
  label: string;
  icon?: string;
  onClick: () => void;
}

export interface PluginNotification {
  id?: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number; // ms, 0 = persistent
}

/**
 * Safe API exposed to plugins
 */
export interface PluginAPI {
  // Plugin identity
  getPluginId: () => string;
  getManifest: () => PluginManifest;

  // State (read-only)
  state: {
    getGameState: () => PluginGameState;
    subscribe: (callback: (state: PluginGameState) => void) => () => void;
  };

  // UI manipulation
  ui: {
    addOverlay: (overlay: PluginOverlay) => void;
    removeOverlay: (id: string) => void;
    addMenuItem: (item: PluginMenuItem) => void;
    removeMenuItem: (id: string) => void;
    showNotification: (notification: PluginNotification) => void;
    updateTheme: (css: string) => void;  // If theme permission granted
  };

  // Storage (scoped to plugin)
  storage: {
    get: <T = unknown>(key: string, defaultValue?: T) => T | undefined;
    set: (key: string, value: unknown) => void;
    remove: (key: string) => void;
    clear: () => void;
  };

  // Lifecycle
  onDisable: (callback: () => void) => void;
  onUninstall: (callback: () => void) => void;
}

/**
 * Plugin interface that user code implements
 */
export interface Plugin {
  /** Called when plugin is enabled */
  onEnable(api: PluginAPI): void | Promise<void>;

  /** Called when plugin is disabled */
  onDisable?(): void | Promise<void>;

  /** Called when plugin is uninstalled */
  onUninstall?(): void | Promise<void>;

  /** Optional settings UI */
  renderSettings?(api: PluginAPI): React.ReactNode;
}

/**
 * Plugin bundle format (what users download/upload)
 */
export interface PluginBundle {
  manifest: PluginManifest;
  code: string;  // Bundled JS code
  assets?: Record<string, string>;  // Asset URLs
}

// ============================================================================
// Unified Plugin Descriptor
// ============================================================================

/**
 * Canonical plugin origin - normalized from all source systems
 *
 * Legacy mapping:
 * - `plugins-dir` → `plugin-dir`
 * - `dev` → `dev-project`
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
 * - `scene` → `scene-view`
 * - `ui` → `ui-plugin`
 * - `tool` → `ui-plugin` (with bundleFamily='tool')
 * - `control-center` → `control-center`
 */
export type UnifiedPluginFamily =
  | 'world-tool'
  | 'helper'
  | 'interaction'
  | 'gallery-tool'
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
  | 'generation-ui';

/**
 * Scene view specific metadata
 */
export interface SceneViewExtension {
  sceneViewId: string;
  surfaces?: Array<'overlay' | 'hud' | 'panel' | 'workspace'>;
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

// ============================================================================
// Origin Normalization
// ============================================================================

/**
 * Legacy origin types from catalog.ts
 */
type LegacyOrigin = 'builtin' | 'plugins-dir' | 'ui-bundle' | 'dev';

/**
 * Normalize plugin origin from any source system
 *
 * Maps legacy origins to canonical origins:
 * - `plugins-dir` → `plugin-dir`
 * - `dev` → `dev-project`
 */
export function normalizeOrigin(origin: string): UnifiedPluginOrigin {
  switch (origin) {
    case 'builtin':
      return 'builtin';
    case 'plugin-dir':
    case 'plugins-dir': // Legacy
      return 'plugin-dir';
    case 'ui-bundle':
      return 'ui-bundle';
    case 'dev':
    case 'dev-project':
      return 'dev-project';
    default:
      console.warn(`Unknown plugin origin: ${origin}, defaulting to 'plugin-dir'`);
      return 'plugin-dir';
  }
}

/**
 * Convert canonical origin to legacy origin (for backward compatibility)
 */
export function toLegacyOrigin(origin: UnifiedPluginOrigin): LegacyOrigin {
  switch (origin) {
    case 'builtin':
      return 'builtin';
    case 'plugin-dir':
      return 'plugins-dir';
    case 'ui-bundle':
      return 'ui-bundle';
    case 'dev-project':
      return 'dev';
  }
}

// ============================================================================
// Family Normalization
// ============================================================================

/**
 * Bundle family types (from manifest.json)
 */
type BundleFamily = 'scene' | 'ui' | 'tool' | 'control-center';

/**
 * Map bundle family to canonical plugin family
 */
export function bundleFamilyToUnified(bundleFamily: BundleFamily): UnifiedPluginFamily {
  switch (bundleFamily) {
    case 'scene':
      return 'scene-view';
    case 'ui':
      return 'ui-plugin';
    case 'tool':
      return 'ui-plugin';
    case 'control-center':
      return 'control-center';
  }
}

/**
 * Map canonical family back to bundle family (if applicable)
 */
export function unifiedFamilyToBundleFamily(family: UnifiedPluginFamily): BundleFamily | null {
  switch (family) {
    case 'scene-view':
      return 'scene';
    case 'ui-plugin':
      return 'ui'; // or 'tool', depends on context
    case 'control-center':
      return 'control-center';
    default:
      return null; // Not a bundle-loadable family
  }
}

// ============================================================================
// Mapping Helpers
// ============================================================================

/**
 * Map PluginManifest (from bundle) to UnifiedPluginDescriptor
 */
export function fromPluginManifest(
  manifest: PluginManifest,
  options: {
    origin?: UnifiedPluginOrigin;
    isActive?: boolean;
    bundleUrl?: string;
  } = {}
): UnifiedPluginDescriptor {
  const bundleFamily = manifest.family;
  const family = bundleFamilyToUnified(bundleFamily);

  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    author: manifest.author,
    icon: manifest.icon,
    family,
    origin: options.origin ?? 'ui-bundle',
    pluginType: manifest.type,
    tags: manifest.tags,
    permissions: manifest.permissions,
    canDisable: options.origin !== 'builtin',
    isActive: options.isActive ?? true,
    isBuiltin: options.origin === 'builtin',
    bundleUrl: options.bundleUrl,
    bundleFamily,
  };
}

/**
 * Backend plugin metadata shape (from PluginInfo/PluginResponse)
 */
interface BackendPluginMetadata {
  permissions?: string[];
  surfaces?: string[];
  default?: boolean;
  scene_view?: {
    scene_view_id: string;
    surfaces: string[];
    default: boolean;
  } | null;
  control_center?: {
    control_center_id: string;
    display_name?: string | null;
    features: string[];
    preview?: string | null;
    default: boolean;
  } | null;
}

/**
 * Map backend PluginInfo/PluginResponse to UnifiedPluginDescriptor
 */
export function fromBackendPlugin(plugin: {
  plugin_id: string;
  name: string;
  description?: string | null;
  version: string;
  author?: string | null;
  icon?: string | null;
  family: string;
  plugin_type: string;
  tags?: string[];
  bundle_url: string;
  manifest_url?: string | null;
  is_builtin: boolean;
  is_enabled: boolean;
  metadata?: BackendPluginMetadata;
}): UnifiedPluginDescriptor {
  const bundleFamily = plugin.family as BundleFamily;
  const family = bundleFamilyToUnified(bundleFamily);

  const descriptor: UnifiedPluginDescriptor = {
    id: plugin.plugin_id,
    name: plugin.name,
    description: plugin.description ?? undefined,
    version: plugin.version,
    author: plugin.author ?? undefined,
    icon: plugin.icon ?? undefined,
    family,
    origin: plugin.is_builtin ? 'builtin' : 'ui-bundle',
    pluginType: plugin.plugin_type as UnifiedPluginDescriptor['pluginType'],
    tags: plugin.tags,
    permissions: plugin.metadata?.permissions as PluginPermission[],
    canDisable: !plugin.is_builtin,
    isActive: plugin.is_enabled,
    isBuiltin: plugin.is_builtin,
    bundleUrl: plugin.bundle_url,
    manifestUrl: plugin.manifest_url ?? undefined,
    bundleFamily,
  };

  // Add family-specific extensions based on metadata
  if (family === 'scene-view') {
    const sceneView = plugin.metadata?.scene_view;
    if (sceneView) {
      descriptor.extensions = {
        sceneView: {
          sceneViewId: sceneView.scene_view_id,
          surfaces: sceneView.surfaces as SceneViewExtension['surfaces'],
          default: sceneView.default,
        },
      };
    } else if (plugin.metadata?.surfaces) {
      // Fallback to legacy flat format
      descriptor.extensions = {
        sceneView: {
          sceneViewId: plugin.plugin_id,
          surfaces: plugin.metadata.surfaces as SceneViewExtension['surfaces'],
          default: plugin.metadata.default,
        },
      };
    }
  } else if (family === 'control-center') {
    const controlCenter = plugin.metadata?.control_center;
    if (controlCenter) {
      descriptor.extensions = {
        controlCenter: {
          controlCenterId: controlCenter.control_center_id,
          displayName: controlCenter.display_name ?? undefined,
          features: controlCenter.features,
          preview: controlCenter.preview ?? undefined,
          default: controlCenter.default,
        },
      };
    }
  }

  return descriptor;
}

/**
 * Convert UnifiedPluginDescriptor to backend PluginCreateRequest shape
 */
export function toBackendPluginCreate(descriptor: UnifiedPluginDescriptor): {
  plugin_id: string;
  name: string;
  description?: string;
  version: string;
  author?: string;
  icon?: string;
  family: string;
  plugin_type: string;
  tags: string[];
  bundle_url: string;
  manifest_url?: string;
  is_builtin: boolean;
  metadata: BackendPluginMetadata;
} {
  const bundleFamily = descriptor.bundleFamily ?? unifiedFamilyToBundleFamily(descriptor.family) ?? 'ui';

  const metadata: BackendPluginMetadata = {
    permissions: descriptor.permissions ?? [],
    surfaces: descriptor.extensions?.sceneView?.surfaces,
    default: descriptor.extensions?.sceneView?.default ?? descriptor.extensions?.controlCenter?.default,
  };

  // Add family-specific nested metadata
  if (descriptor.extensions?.sceneView) {
    metadata.scene_view = {
      scene_view_id: descriptor.extensions.sceneView.sceneViewId,
      surfaces: descriptor.extensions.sceneView.surfaces ?? [],
      default: descriptor.extensions.sceneView.default ?? false,
    };
  }

  if (descriptor.extensions?.controlCenter) {
    metadata.control_center = {
      control_center_id: descriptor.extensions.controlCenter.controlCenterId,
      display_name: descriptor.extensions.controlCenter.displayName,
      features: descriptor.extensions.controlCenter.features ?? [],
      preview: descriptor.extensions.controlCenter.preview,
      default: descriptor.extensions.controlCenter.default ?? false,
    };
  }

  return {
    plugin_id: descriptor.id,
    name: descriptor.name,
    description: descriptor.description,
    version: descriptor.version ?? '1.0.0',
    author: descriptor.author,
    icon: descriptor.icon,
    family: bundleFamily,
    plugin_type: descriptor.pluginType ?? 'ui-overlay',
    tags: descriptor.tags ?? [],
    bundle_url: descriptor.bundleUrl ?? '',
    manifest_url: descriptor.manifestUrl,
    is_builtin: descriptor.isBuiltin,
    metadata,
  };
}

// ============================================================================
// Family-Specific Validation
// ============================================================================

/**
 * Validation result for family-specific metadata
 */
export interface FamilyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate family-specific metadata requirements
 *
 * Each family has specific required fields:
 * - scene-view: sceneView.sceneViewId required, surfaces recommended
 * - control-center: controlCenter.controlCenterId required
 * - dock-widget: dockWidget.widgetId and dockviewId required
 * - workspace-panel: workspacePanel.panelId required
 */
export function validateFamilyMetadata(descriptor: UnifiedPluginDescriptor): FamilyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  switch (descriptor.family) {
    case 'scene-view': {
      const ext = descriptor.extensions?.sceneView;
      if (!ext?.sceneViewId) {
        errors.push('scene-view plugins require extensions.sceneView.sceneViewId');
      }
      if (!ext?.surfaces || ext.surfaces.length === 0) {
        warnings.push('scene-view plugins should define surfaces (overlay, hud, panel, workspace)');
      }
      break;
    }

    case 'control-center': {
      const ext = descriptor.extensions?.controlCenter;
      if (!ext?.controlCenterId) {
        errors.push('control-center plugins require extensions.controlCenter.controlCenterId');
      }
      break;
    }

    case 'dock-widget': {
      const ext = descriptor.extensions?.dockWidget;
      if (!ext?.widgetId) {
        errors.push('dock-widget plugins require extensions.dockWidget.widgetId');
      }
      if (!ext?.dockviewId) {
        errors.push('dock-widget plugins require extensions.dockWidget.dockviewId');
      }
      break;
    }

    case 'workspace-panel': {
      const ext = descriptor.extensions?.workspacePanel;
      if (!ext?.panelId) {
        errors.push('workspace-panel plugins require extensions.workspacePanel.panelId');
      }
      break;
    }

    case 'gizmo-surface': {
      const ext = descriptor.extensions?.gizmoSurface;
      if (!ext?.gizmoSurfaceId) {
        warnings.push('gizmo-surface plugins should define extensions.gizmoSurface.gizmoSurfaceId');
      }
      break;
    }

    // Other families have no specific requirements currently
    default:
      break;
  }

  // Common validations
  if (!descriptor.id) {
    errors.push('Plugin id is required');
  }
  if (!descriptor.name) {
    errors.push('Plugin name is required');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

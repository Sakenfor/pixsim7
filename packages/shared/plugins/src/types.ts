/**
 * Core Plugin System Types
 *
 * Pure TypeScript types for plugin metadata, families, and origins.
 * No framework dependencies.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Plugin origin indicates where the plugin was loaded from
 */
export type PluginOrigin =
  | 'builtin'       // Core functionality shipped with the app
  | 'plugin-dir'    // User plugins from plugins/ directory
  | 'ui-bundle'     // Dynamically loaded UI plugins via PluginManager
  | 'dev-project';  // Development-time plugins (e.g., example plugins)

/**
 * Plugin family/category - defines what kind of functionality the plugin provides
 */
export type PluginFamily =
  | 'world-tool'
  | 'helper'
  | 'interaction'
  | 'gallery-tool'
  | 'brain-tool'
  | 'gallery-surface'
  | 'node-type'
  | 'renderer'
  | 'ui-plugin'
  | 'generation-ui'
  | 'scene-view'
  | 'control-center'
  | 'graph-editor'
  | 'dev-tool'
  | 'workspace-panel'
  | 'dock-widget'
  | 'gizmo-surface'
  | 'panel-group';

/**
 * Activation state - whether the plugin is currently active
 */
export type ActivationState = 'active' | 'inactive';

/**
 * Capability hints for feature plugins
 */
export interface PluginCapabilityHints {
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
 * Core metadata that all plugins should have
 */
export interface PluginMetadata {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Plugin family */
  family: PluginFamily;

  /** Where this plugin came from */
  origin: PluginOrigin;

  /** Current activation state */
  activationState: ActivationState;

  /** Whether this plugin can be disabled (some built-ins may be always-on) */
  canDisable: boolean;

  /** Optional version */
  version?: string;

  /** Optional description */
  description?: string;

  /** Optional author */
  author?: string;

  /** Tags for filtering/searching */
  tags?: string[];

  /** Capability hints for feature plugins */
  capabilities?: PluginCapabilityHints;

  /** Features this plugin provides */
  providesFeatures?: string[];

  /** Features this plugin consumes */
  consumesFeatures?: string[];

  /** Actions this plugin consumes */
  consumesActions?: string[];

  /** State IDs this plugin consumes */
  consumesState?: string[];

  /** Mark as experimental/beta */
  experimental?: boolean;

  /** Mark as deprecated */
  deprecated?: boolean;

  /** Deprecation message explaining what to use instead */
  deprecationMessage?: string;

  /** ID of plugin this replaces (for migration/upgrade paths) */
  replaces?: string;

  /** Whether plugin has configurable settings */
  configurable?: boolean;
}

/**
 * Extended metadata for specific plugin families
 */
export interface PluginMetadataExtensions {
  'world-tool': {
    category?: string;
    icon?: string;
  };
  'helper': {
    category?: string;
  };
  'interaction': {
    category?: string;
    icon?: string;
  };
  'gallery-tool': {
    category?: string;
  };
  'brain-tool': {
    category?: string;
    icon?: string;
  };
  'gallery-surface': {
    category?: string;
    icon?: string;
  };
  'node-type': {
    category?: string;
    scope?: 'scene' | 'arc' | 'world' | 'custom';
    userCreatable?: boolean;
    preloadPriority?: number;
  };
  'renderer': {
    nodeType: string;
    preloadPriority?: number;
  };
  'ui-plugin': {
    hasOverlays?: boolean;
    hasMenuItems?: boolean;
    pluginType?: 'ui-overlay' | 'theme' | 'tool' | 'enhancement';
    bundleFamily?: 'ui' | 'tool';
    icon?: string;
  };
  'generation-ui': {
    providerId: string;
    operations?: string[];
    priority?: number;
    category?: string;
  };
  'scene-view': {
    sceneViewId: string;
    surfaces?: Array<'overlay' | 'hud' | 'panel' | 'workspace'>;
    default?: boolean;
    icon?: string;
  };
  'control-center': {
    controlCenterId: string;
    displayName?: string;
    description?: string;
    preview?: string;
    default?: boolean;
    features?: string[];
    icon?: string;
  };
  'graph-editor': {
    storeId?: string;
    category?: string;
    supportsMultiScene?: boolean;
    supportsWorldContext?: boolean;
    supportsPlayback?: boolean;
  };
  'dev-tool': {
    category?: string;
    icon?: string;
  };
  'workspace-panel': {
    panelId: string;
    category?: 'core' | 'development' | 'game' | 'tools' | 'custom';
    supportsCompactMode?: boolean;
    supportsMultipleInstances?: boolean;
  };
  'dock-widget': {
    widgetId: string;
    dockviewId: string;
    presetScope?: string;
    panelScope?: string;
    storageKey?: string;
    allowedPanels?: string[];
    defaultPanels?: string[];
  };
  'gizmo-surface': {
    gizmoSurfaceId?: string;
    category?: 'scene' | 'world' | 'npc' | 'debug' | 'custom';
    supportsContexts?: Array<'scene-editor' | 'game-2d' | 'game-3d' | 'playground' | 'workspace' | 'hud'>;
    icon?: string;
  };
  'panel-group': {
    groupId: string;
    category?: string;
    icon?: string;
    slots?: string[];
    presets?: string[];
    defaultScopes?: string[];
  };
}

/**
 * Full plugin metadata with family-specific extensions
 */
export type ExtendedPluginMetadata<F extends PluginFamily = PluginFamily> =
  PluginMetadata & PluginMetadataExtensions[F];

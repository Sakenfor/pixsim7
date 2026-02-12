/**
 * Bundle API Types
 *
 * Types for user-installable UI plugins (sandbox plugin system).
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

import type { ActionDefinition, AppMapMetadata } from '@pixsim7/shared.types';
import type { ComponentType, LazyExoticComponent } from 'react';

// Lifecycle helpers
export {
  createModuleInitializer,
  createModuleCleanup,
  isModuleInitialized,
  resetModuleState,
  getInitializedModules,
  warnUnguardedInit,
} from './lifecycle';

/**
 * Module Initialization Priorities
 *
 * Standard priority levels for module initialization order.
 * Higher priority modules are initialized first.
 */
export const MODULE_PRIORITIES = {
  /** Critical infrastructure (plugin bootstrap, registries) */
  INFRASTRUCTURE: 100,
  /** Core systems (graph system, game session) */
  CORE_SYSTEM: 75,
  /** Standard modules (features, UI components) */
  STANDARD: 50,
  /** Optional enhancements (analytics, debugging) */
  OPTIONAL: 25,
} as const;

export type ModulePriority = (typeof MODULE_PRIORITIES)[keyof typeof MODULE_PRIORITIES];

/**
 * Type guard to check if an object is a valid Module.
 *
 * Validates that the object has the required `id` and `name` properties.
 * Useful for auto-discovery and dynamic module loading.
 *
 * @param obj - The object to validate
 * @returns True if the object is a valid Module
 */
export function isValidModule<T extends ModuleDefinition = ModuleDefinition>(
  obj: unknown
): obj is T {
  if (!obj || typeof obj !== 'object') return false;
  const mod = obj as Record<string, unknown>;
  return typeof mod.id === 'string' && typeof mod.name === 'string';
}

/**
 * Page Categories
 *
 * Defines the available categories for organizing pages in the application.
 * These categories are used for grouping pages on the homepage and filtering.
 */
export const PAGE_CATEGORIES = {
  /**
   * Content Creation
   * Pages for creating and editing content (scenes, arcs, narratives, assets)
   * Examples: Workspace, Arc Graph Editor, Scene Builder
   */
  creation: 'creation',

  /**
   * Automation & AI
   * Pages for automation, workflows, and AI-powered generation
   * Examples: Automation Hub, Generation Queue, Template Editor
   */
  automation: 'automation',

  /**
   * Game & World
   * Pages for game mechanics, world building, and gameplay
   * Examples: Game World, NPC Brain Lab, 2D Game, Interaction Studio
   */
  game: 'game',

  /**
   * Management
   * Pages for system management, monitoring, and configuration
   * Examples: Gallery, Health Monitor, Asset Management
   */
  management: 'management',

  /**
   * Development
   * Pages for development tools, debugging, and technical exploration
   * Examples: Graph View, Gizmo Lab, App Map, Modules Overview
   */
  development: 'development',
} as const;

/**
 * Page category type
 */
export type PageCategory = (typeof PAGE_CATEGORIES)[keyof typeof PAGE_CATEGORIES];

export interface ModulePageConfig<DevToolCategory = string, CapabilityCategory = string> {
  /** Route path (e.g., '/assets', '/workspace') */
  route: string;
  /** Icon name from icon library */
  icon: string;
  /** Short description for the page card */
  description: string;
  /**
   * Category for grouping pages
   * Use PAGE_CATEGORIES constants to ensure consistency
   */
  category: PageCategory;
  /** Show in featured/quick access section */
  featured?: boolean;
  /** Hide from page listing (for internal/dev pages) */
  hidden?: boolean;
  /** Custom icon color class (e.g., 'text-red-500') */
  iconColor?: string;
  /**
   * React component for the route (optional)
   * Can be a lazy-loaded component for code splitting:
   * component: lazy(() => import('./MyPage'))
   */
  component?: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
  /**
   * Capability feature ID to associate this page with.
   * When set, the page is registered into the capability registry.
   */
  featureId?: string;
  /**
   * Marks this page as the primary source of feature metadata.
   * Defaults to true when featureId matches module.id.
   */
  featurePrimary?: boolean;
  /**
   * Capability category override (uses page category mapping by default).
   */
  capabilityCategory?: CapabilityCategory;
  /**
   * Override whether the page should appear in navigation.
   * Defaults to false for development pages, true otherwise.
   */
  showInNav?: boolean;
  /**
   * Whether the route requires authentication.
   * Defaults to true for module pages.
   */
  protected?: boolean;

  /**
   * Actions provided by this module.
   * Registered automatically via the module registry.
   * Uses canonical ActionDefinition from @pixsim7/shared.types.
   */
  actions?: ActionDefinition[];

  /**
   * App Map metadata for dynamic tooling (App Map panel, exports).
   * Keep paths workspace-relative (e.g., docs/..., features/...).
   */
  appMap?: AppMapMetadata;

  /**
   * Dev Tool configuration (optional).
   * When defined, this module is auto-registered as a dev tool,
   * accessible via the dev tools palette/panel system.
   */
  devTool?: {
    /**
     * Panel component for the dev tool.
     * If omitted, the route component is used (wrapped appropriately).
     */
    panelComponent?: ComponentType<any>;
    /**
     * Dev tool category for grouping in the palette.
     * Defaults to 'misc' if not specified.
     */
    category?: DevToolCategory;
    /**
     * Tags for filtering/search in the dev tools palette.
     */
    tags?: string[];
    /**
     * Whether this tool is safe for non-dev users.
     * Defaults to false.
     */
    safeForNonDev?: boolean;
  };
}

/**
 * Base Module Interface
 *
 * All modules should implement this interface to ensure consistent communication
 * and integration across the application.
 */
export interface ModuleDefinition<
  PanelDefinition = unknown,
  DevToolCategory = string,
  CapabilityCategory = string
> {
  /** Unique identifier for the module */
  id: string;

  /** Human-readable module name */
  name: string;

  /**
   * Module initialization priority (optional)
   * Higher priority modules are initialized first.
   * Default priority is 50 if not specified.
   *
   * Suggested priorities:
   * - 100: Critical infrastructure (plugin bootstrap, registries)
   * - 75: Core systems (graph system, game session)
   * - 50: Standard modules (features, UI components)
   * - 25: Optional enhancements (analytics, debugging)
   */
  priority?: number;

  /**
   * Module dependencies (optional)
   * List of module IDs that must be initialized before this module.
   * The module registry will ensure dependencies are initialized first.
   */
  dependsOn?: string[];

  /** Module initialization - called when app starts */
  initialize?: () => Promise<void> | void;

  /** Module cleanup - called when app unmounts */
  cleanup?: () => Promise<void> | void;

  /** Check if module is ready to use */
  isReady?: () => boolean;

  /**
   * Control Center panels (optional)
   * Modules can provide CC panels that will be automatically registered
   * to the panel catalog with 'control-center' tag.
   * These are rendered via SmartDockview in the Control Center.
   */
  controlCenterPanels?: PanelDefinition[];

  /**
   * Page/Route Configuration (optional)
   * If the module provides a user-accessible page, define it here
   */
  page?: ModulePageConfig<DevToolCategory, CapabilityCategory>;
}

export type Module<
  PanelDefinition = unknown,
  DevToolCategory = string,
  CapabilityCategory = string
> = ModuleDefinition<PanelDefinition, DevToolCategory, CapabilityCategory>;

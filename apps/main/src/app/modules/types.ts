import { logEvent } from '@lib/utils';
import type { BasePanelDefinition } from '@features/panels/lib/panelTypes';
import type { ComponentType, LazyExoticComponent } from 'react';

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

/**
 * Base Module Interface
 *
 * All modules should implement this interface to ensure consistent communication
 * and integration across the application.
 */
export interface Module {
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
   * to the global panelRegistry with 'control-center' tag.
   * These are rendered via SmartDockview in the Control Center.
   */
  controlCenterPanels?: BasePanelDefinition[];

  /**
   * Page/Route Configuration (optional)
   * If the module provides a user-accessible page, define it here
   */
  page?: {
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
  };
}

/**
 * Module Service Registry
 *
 * Central registry for all modules. Modules register themselves
 * and can expose their API through this registry.
 */
class ModuleRegistry {
  private modules = new Map<string, Module>();
  private listeners: Array<() => void> = [];

  /**
   * Subscribe to module registry changes
   * The listener will be called whenever a module is registered
   * @returns unsubscribe function
   */
  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => this.unsubscribe(listener);
  }

  /**
   * Unsubscribe from module registry changes
   */
  private unsubscribe(listener: () => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners of a registry change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch (error) {
        console.error('Error in module registry listener:', error);
      }
    });
  }

  register(module: Module) {
    if (this.modules.has(module.id)) {
      logEvent('WARNING', 'module_already_registered', { moduleId: module.id });
      return;
    }

    this.modules.set(module.id, module);
    logEvent('INFO', 'module_registered', { moduleId: module.id, moduleName: module.name });

    // Notify listeners of the registry change
    this.notifyListeners();

    // Auto-register any Control Center panels to global panelRegistry
    if (module.controlCenterPanels && module.controlCenterPanels.length > 0) {
      // Dynamic import to avoid circular dependency
      import('@features/panels/lib/panelRegistry').then(({ registerSimplePanel }) => {
        module.controlCenterPanels!.forEach(panel => {
          // Add 'control-center' tag for filtering
          const tags = [...(panel.tags ?? []), 'control-center'];
          registerSimplePanel({ ...panel, tags });
          logEvent('INFO', 'cc_panel_registered_from_module', {
            moduleId: module.id,
            panelId: panel.id,
            panelTitle: panel.title
          });
        });
      });
    }
  }

  get<T extends Module>(id: string): T | undefined {
    return this.modules.get(id) as T | undefined;
  }

  async initializeAll() {
    logEvent('INFO', 'modules_initializing', { count: this.modules.size });

    // Sort modules by priority (higher priority first) and handle dependencies
    const modulesToInit = this.getSortedModules();
    const initialized = new Set<string>();

    for (const module of modulesToInit) {
      // Check if dependencies are satisfied
      if (module.dependsOn && module.dependsOn.length > 0) {
        const missingDeps = module.dependsOn.filter(dep => !initialized.has(dep));
        if (missingDeps.length > 0) {
          console.warn(
            `⚠ Module "${module.name}" has uninitialized dependencies: ${missingDeps.join(', ')}`
          );
          logEvent('WARNING', 'module_missing_dependencies', {
            moduleId: module.id,
            moduleName: module.name,
            missingDeps,
          });
        }
      }

      if (module.initialize) {
        try {
          await module.initialize();
          initialized.add(module.id);
          logEvent('INFO', 'module_initialized', {
            moduleId: module.id,
            moduleName: module.name,
            priority: module.priority ?? 50,
          });
        } catch (error) {
          console.error(`✗ Failed to initialize ${module.name}:`, error);
          logEvent('ERROR', 'module_init_failed', {
            moduleId: module.id,
            moduleName: module.name,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      } else {
        // Module has no initialize function, mark as initialized anyway
        initialized.add(module.id);
      }
    }

    logEvent('INFO', 'modules_initialized', { count: this.modules.size });
  }

  /**
   * Get modules sorted by priority and dependencies
   * Higher priority modules come first, with dependency ordering respected
   */
  private getSortedModules(): Module[] {
    const modules = Array.from(this.modules.values());

    // Topological sort respecting dependencies
    const sorted: Module[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (module: Module) => {
      if (visited.has(module.id)) return;
      if (visiting.has(module.id)) {
        console.warn(`⚠ Circular dependency detected involving module "${module.name}"`);
        return;
      }

      visiting.add(module.id);

      // Visit dependencies first
      if (module.dependsOn) {
        for (const depId of module.dependsOn) {
          const dep = this.modules.get(depId);
          if (dep) {
            visit(dep);
          }
        }
      }

      visiting.delete(module.id);
      visited.add(module.id);
      sorted.push(module);
    };

    // Sort by priority first (higher priority = earlier)
    const byPriority = [...modules].sort((a, b) => {
      const aPriority = a.priority ?? 50;
      const bPriority = b.priority ?? 50;
      return bPriority - aPriority;
    });

    // Then apply topological sort
    for (const module of byPriority) {
      visit(module);
    }

    return sorted;
  }

  async cleanupAll() {
    for (const [, module] of this.modules) {
      if (module.cleanup) {
        try {
          await module.cleanup();
        } catch (error) {
          console.error(`Failed to cleanup ${module.name}:`, error);
        }
      }
    }
  }

  list() {
    return Array.from(this.modules.values());
  }

  /**
   * Get all modules that have page configurations
   * Useful for rendering navigation and page listings
   */
  getPages(options?: { category?: PageCategory; featured?: boolean; includeHidden?: boolean }) {
    return Array.from(this.modules.values())
      .filter(module => {
        if (!module.page) return false;
        if (!options?.includeHidden && module.page.hidden) return false;
        if (options?.category && module.page.category !== options.category) return false;
        if (options?.featured !== undefined && module.page.featured !== options.featured) return false;
        return true;
      })
      .map(module => ({
        id: module.id,
        name: module.name,
        ...module.page!,
        isReady: module.isReady?.() ?? true,
      }));
  }

  /**
   * Get pages grouped by category
   */
  getPagesByCategory(options?: { includeHidden?: boolean }) {
    const pages = this.getPages(options);
    const grouped: Record<string, typeof pages> = {};

    for (const page of pages) {
      if (!grouped[page.category]) {
        grouped[page.category] = [];
      }
      grouped[page.category].push(page);
    }

    return grouped;
  }
}

export const moduleRegistry = new ModuleRegistry();

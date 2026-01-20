import type { FeatureCapability } from '@lib/capabilities';
import {
  registerActionsFromDefinitions,
  registerFeature,
  registerRoute,
} from '@lib/capabilities';
import { panelSelectors } from '@lib/plugins/catalogSelectors';
import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';
import { logEvent } from '@lib/utils';

import type { PanelDefinition } from '@features/panels/lib/panelRegistry';

import type { Module, PageCategory } from './contracts';


type CapabilityCategory = FeatureCapability['category'];

const PAGE_CATEGORY_TO_CAPABILITY: Record<PageCategory, CapabilityCategory> = {
  creation: 'creation',
  automation: 'utility',
  game: 'game',
  management: 'management',
  development: 'utility',
};

function registerModuleCapabilities(module: Module) {
  const page = module.page;
  if (!page) {
    return;
  }

  if (page.featureId) {
    const featureId = page.featureId;
    const category = page.capabilityCategory ?? PAGE_CATEGORY_TO_CAPABILITY[page.category];
    const isPrimary = page.featurePrimary ?? page.featureId === module.id;

    if (isPrimary) {
      // Build feature from module page config
      // Merging with existing features is handled by registerFeature with mode: 'upsert'
      const derivedFeature: FeatureCapability = {
        id: featureId,
        name: module.name,
        description: page.description,
        icon: page.icon,
        category,
        ...(module.priority !== undefined ? { priority: module.priority } : {}),
        ...(page.appMap ? { metadata: { appMap: page.appMap } } : {}),
      };

      registerFeature(derivedFeature, { mode: 'upsert' });
    }

    const showInNav =
      page.showInNav ?? (!page.hidden && page.category !== 'development');
    const protectedRoute = page.protected ?? true;
    registerRoute({
      path: page.route,
      name: module.name,
      description: page.description,
      icon: page.icon,
      protected: protectedRoute,
      showInNav,
      featureId,
    });
  }

  // Register module-defined actions
  if (page.actions && page.actions.length > 0) {
    if (!page.featureId) {
      logEvent('WARNING', 'module_actions_missing_feature_id', {
        moduleId: module.id,
        moduleName: module.name,
      });
    }

    registerActionsFromDefinitions(page.actions);
    for (const action of page.actions) {
      logEvent('DEBUG', 'module_action_registered', {
        moduleId: module.id,
        actionId: action.id,
      });
    }
  }
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
  private initialized = false;
  private initializedModules = new Set<string>();
  private capabilitiesRegistered = new Set<string>();

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

    // Auto-register any Control Center panels to plugin catalog
    if (module.controlCenterPanels && module.controlCenterPanels.length > 0) {
      module.controlCenterPanels.forEach((panel) => {
        if (panelSelectors.has(panel.id)) {
          return;
        }

        const tags = [...(panel.tags ?? []), 'control-center'];
        const definition: PanelDefinition = {
          ...panel,
          id: panel.id as any,
          category: (panel.category ?? 'custom') as any,
          tags,
        };

        void registerPluginDefinition({
          id: definition.id,
          family: 'workspace-panel',
          origin: 'builtin',
          source: 'source',
          plugin: definition,
          canDisable: false,
        }).catch((error) => {
          console.warn(
            '[ModuleRegistry] Failed to register control center panel:',
            error,
          );
        });

        logEvent('INFO', 'cc_panel_registered_from_module', {
          moduleId: module.id,
          panelId: panel.id,
          panelTitle: panel.title
        });
      });
    }
  }

  get<T extends Module>(id: string): T | undefined {
    return this.modules.get(id) as T | undefined;
  }

  async initializeAll() {
    if (this.initialized) {
      if (import.meta.env?.DEV) {
        console.warn(
          '[ModuleRegistry] initializeAll called more than once',
          new Error('Duplicate initializeAll call').stack
        );
      }
      return;
    }
    this.initialized = true;

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
        if (this.initializedModules.has(module.id)) {
          if (!initialized.has(module.id)) {
            initialized.add(module.id);
          }
          continue;
        }
        try {
          await module.initialize();
          initialized.add(module.id);
          this.initializedModules.add(module.id);
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

      if (initialized.has(module.id) && !this.capabilitiesRegistered.has(module.id)) {
        registerModuleCapabilities(module);
        this.capabilitiesRegistered.add(module.id);
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
    this.initialized = false;
    this.initializedModules.clear();
    this.capabilitiesRegistered.clear();
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

  /**
   * Get all modules that have dev tool configurations.
   * Used by registerDevTools to auto-register dev tools from modules.
   */
  getModulesWithDevTools() {
    return Array.from(this.modules.values()).filter(
      (module) => module.page?.devTool
    );
  }
}

export const moduleRegistry = new ModuleRegistry();

/**
 * Console Module Registry
 *
 * Plugin-like system for console extensions.
 * Each module can register its own operations, data stores, and cleanup logic.
 *
 * @example
 * ```ts
 * // In your module file (e.g., modules/tools.ts)
 * export const toolsModule: ConsoleModule = {
 *   id: 'tools',
 *   name: 'Tools',
 *   description: 'Interactive tool operations',
 *   register: () => {
 *     opsRegistry.registerCategory('tools', 'Tools', 'Tool operations');
 *     opsRegistry.register('tools', { ... });
 *   },
 * };
 *
 * // In console initialization
 * moduleRegistry.register(toolsModule);
 * // Or register multiple at once
 * moduleRegistry.registerAll([toolsModule, gizmosModule]);
 * ```
 */

export interface ConsoleModule {
  /** Unique module identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Brief description */
  description?: string;
  /** Dependencies on other modules (by id) */
  dependencies?: string[];
  /** Registration function - called when module is loaded */
  register: () => void;
  /** Cleanup function - called when module is unloaded (optional) */
  unregister?: () => void;
}

class ModuleRegistry {
  private modules = new Map<string, ConsoleModule>();
  private initialized = new Set<string>();

  /**
   * Register a single module
   */
  register(module: ConsoleModule): void {
    if (this.modules.has(module.id)) {
      console.warn(`[ConsoleModule] Module "${module.id}" already registered, skipping`);
      return;
    }

    this.modules.set(module.id, module);

    // Check dependencies
    if (module.dependencies) {
      for (const dep of module.dependencies) {
        if (!this.initialized.has(dep)) {
          console.warn(
            `[ConsoleModule] Module "${module.id}" depends on "${dep}" which is not yet initialized`
          );
        }
      }
    }

    // Initialize the module
    try {
      module.register();
      this.initialized.add(module.id);
      console.debug(`[ConsoleModule] Registered: ${module.id}`);
    } catch (err) {
      console.error(`[ConsoleModule] Failed to register "${module.id}":`, err);
    }
  }

  /**
   * Register multiple modules at once
   * Modules are registered in order, so put dependencies first
   */
  registerAll(modules: ConsoleModule[]): void {
    for (const module of modules) {
      this.register(module);
    }
  }

  /**
   * Unregister a module (if it supports cleanup)
   */
  unregister(moduleId: string): void {
    const module = this.modules.get(moduleId);
    if (!module) {
      console.warn(`[ConsoleModule] Module "${moduleId}" not found`);
      return;
    }

    if (module.unregister) {
      try {
        module.unregister();
      } catch (err) {
        console.error(`[ConsoleModule] Failed to unregister "${moduleId}":`, err);
      }
    }

    this.modules.delete(moduleId);
    this.initialized.delete(moduleId);
  }

  /**
   * Check if a module is registered
   */
  has(moduleId: string): boolean {
    return this.modules.has(moduleId);
  }

  /**
   * Get a module by ID
   */
  get(moduleId: string): ConsoleModule | undefined {
    return this.modules.get(moduleId);
  }

  /**
   * Get all registered module IDs
   */
  keys(): string[] {
    return Array.from(this.modules.keys());
  }

  /**
   * Get all registered modules
   */
  entries(): ConsoleModule[] {
    return Array.from(this.modules.values());
  }

  /**
   * Clear all modules (useful for testing)
   */
  clear(): void {
    // Unregister in reverse order
    const ids = Array.from(this.modules.keys()).reverse();
    for (const id of ids) {
      this.unregister(id);
    }
  }
}

/** Global module registry instance */
export const moduleRegistry = new ModuleRegistry();

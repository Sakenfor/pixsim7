import { logEvent } from '../lib/logging';

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

  /** Module initialization - called when app starts */
  initialize?: () => Promise<void> | void;

  /** Module cleanup - called when app unmounts */
  cleanup?: () => Promise<void> | void;

  /** Check if module is ready to use */
  isReady?: () => boolean;
}

/**
 * Module Service Registry
 *
 * Central registry for all modules. Modules register themselves
 * and can expose their API through this registry.
 */
class ModuleRegistry {
  private modules = new Map<string, Module>();

  register(module: Module) {
    if (this.modules.has(module.id)) {
      logEvent('WARNING', 'module_already_registered', { moduleId: module.id });
      return;
    }

    this.modules.set(module.id, module);
    logEvent('INFO', 'module_registered', { moduleId: module.id, moduleName: module.name });
  }

  get<T extends Module>(id: string): T | undefined {
    return this.modules.get(id) as T | undefined;
  }

  async initializeAll() {
    logEvent('INFO', 'modules_initializing', { count: this.modules.size });

    for (const [, module] of this.modules) {
      if (module.initialize) {
        try {
          await module.initialize();
          logEvent('INFO', 'module_initialized', { moduleId: module.id, moduleName: module.name });
        } catch (error) {
          console.error(`✗ Failed to initialize ${module.name}:`, error);
          logEvent('ERROR', 'module_init_failed', {
            moduleId: module.id,
            moduleName: module.name,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    logEvent('INFO', 'modules_initialized', { count: this.modules.size });
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
}

export const moduleRegistry = new ModuleRegistry();

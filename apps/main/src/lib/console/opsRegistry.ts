/**
 * Operations Registry for Console Namespace
 *
 * Provides a Blender-style ops interface: pixsim.ops.scene.create()
 * Operations are grouped by category and registered dynamically.
 *
 * Usage: pixsim.ops.scene.create({ title: 'New Scene' })
 */

export interface Operation {
  /** Unique identifier within category (e.g., 'create', 'delete') */
  id: string;
  /** Human-readable name */
  name: string;
  /** Brief description */
  description: string;
  /** The operation function */
  execute: (...args: unknown[]) => unknown;
  /** Parameter schema for autocomplete/validation (optional) */
  params?: Array<{
    name: string;
    type: string;
    required?: boolean;
    description?: string;
  }>;
}

export interface OperationCategory {
  /** Category ID (e.g., 'scene', 'node', 'workspace') */
  id: string;
  /** Human-readable name */
  name: string;
  /** Brief description */
  description: string;
  /** Operations in this category */
  operations: Map<string, Operation>;
}

class OpsRegistry {
  private categories = new Map<string, OperationCategory>();

  /**
   * Register an operation category
   */
  registerCategory(id: string, name: string, description: string): OperationCategory {
    if (!this.categories.has(id)) {
      this.categories.set(id, {
        id,
        name,
        description,
        operations: new Map(),
      });
    }
    return this.categories.get(id)!;
  }

  /**
   * Register an operation
   */
  register(categoryId: string, operation: Operation): void {
    let category = this.categories.get(categoryId);
    if (!category) {
      // Auto-create category
      category = this.registerCategory(categoryId, categoryId, `Operations for ${categoryId}`);
    }
    if (category.operations.has(operation.id)) {
      console.warn(`[OpsRegistry] Operation "${categoryId}.${operation.id}" already registered, overwriting`);
    }
    category.operations.set(operation.id, operation);
  }

  /**
   * Get a category by ID
   */
  getCategory(id: string): OperationCategory | undefined {
    return this.categories.get(id);
  }

  /**
   * Get an operation
   */
  getOperation(categoryId: string, opId: string): Operation | undefined {
    return this.categories.get(categoryId)?.operations.get(opId);
  }

  /**
   * Execute an operation
   */
  execute(categoryId: string, opId: string, ...args: unknown[]): unknown {
    const op = this.getOperation(categoryId, opId);
    if (!op) {
      throw new Error(`Unknown operation: ${categoryId}.${opId}`);
    }
    return op.execute(...args);
  }

  /**
   * Get all category IDs
   */
  categoryKeys(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Get all operations in a category
   */
  operationKeys(categoryId: string): string[] {
    const category = this.categories.get(categoryId);
    return category ? Array.from(category.operations.keys()) : [];
  }

  /**
   * Get all categories (for introspection/help)
   */
  entries(): OperationCategory[] {
    return Array.from(this.categories.values());
  }

  /**
   * Create a proxy for a category that provides dynamic access to operations
   */
  private createCategoryProxy(categoryId: string): Record<string, unknown> {
    const self = this;
    return new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === '__keys__') return self.operationKeys(categoryId);
          if (prop === '__help__') {
            const category = self.getCategory(categoryId);
            return category ? Array.from(category.operations.values()) : [];
          }
          const op = self.getOperation(categoryId, prop);
          if (!op) {
            console.warn(
              `[pixsim.ops.${categoryId}] Unknown operation: "${prop}". Available: ${self.operationKeys(categoryId).join(', ')}`
            );
            return undefined;
          }
          // Return bound execute function
          return (...args: unknown[]) => op.execute(...args);
        },
        has(_target, prop: string) {
          return self.getOperation(categoryId, prop) !== undefined;
        },
        ownKeys() {
          return self.operationKeys(categoryId);
        },
        getOwnPropertyDescriptor(_target, prop: string) {
          const op = self.getOperation(categoryId, prop);
          if (op) {
            return { configurable: true, enumerable: true, value: op.execute };
          }
          return undefined;
        },
      }
    );
  }

  /**
   * Create the top-level ops proxy
   */
  createProxy(): Record<string, unknown> {
    const self = this;
    const categoryProxies = new Map<string, Record<string, unknown>>();

    return new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === '__keys__') return self.categoryKeys();
          if (prop === '__help__') return self.entries();

          // Return cached or create new category proxy
          if (!categoryProxies.has(prop)) {
            if (!self.categories.has(prop)) {
              console.warn(
                `[pixsim.ops] Unknown category: "${prop}". Available: ${self.categoryKeys().join(', ')}`
              );
              return undefined;
            }
            categoryProxies.set(prop, self.createCategoryProxy(prop));
          }
          return categoryProxies.get(prop);
        },
        has(_target, prop: string) {
          return self.categories.has(prop);
        },
        ownKeys() {
          return self.categoryKeys();
        },
        getOwnPropertyDescriptor(_target, prop: string) {
          if (self.categories.has(prop)) {
            return {
              configurable: true,
              enumerable: true,
              value: self.createCategoryProxy(prop),
            };
          }
          return undefined;
        },
      }
    );
  }
}

export const opsRegistry = new OpsRegistry();

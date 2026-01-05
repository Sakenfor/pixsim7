/**
 * Console Manifest Types
 *
 * Declarative pattern for console module registration.
 * Manifests declare operations, data stores, and categories,
 * enabling thin module wrappers that call a shared loader.
 */

import type { DataStoreRegistration, dataRegistry } from '../dataRegistry';
import type { Operation, opsRegistry } from '../opsRegistry';

/**
 * Category declaration for operations grouping
 */
export interface CategoryDeclaration {
  /** Unique category identifier (e.g., 'stats', 'workspace') */
  id: string;
  /** Human-readable name */
  name: string;
  /** Brief description */
  description: string;
}

/**
 * Operation declaration with its category
 */
export interface OperationDeclaration {
  /** Category ID this operation belongs to */
  categoryId: string;
  /** The operation definition */
  op: Operation;
}

/**
 * Operations section of a manifest
 */
export interface OpsDeclaration {
  /** Category definitions */
  categories?: CategoryDeclaration[];
  /** Operation definitions */
  operations?: OperationDeclaration[];
}

/**
 * Registration context passed to dynamic register functions
 */
export interface ManifestRegistrationContext {
  opsRegistry: typeof opsRegistry;
  dataRegistry: typeof dataRegistry;
}

/**
 * Console Manifest
 *
 * Declarative structure for console module registration.
 * Can declare static operations/data or use a dynamic register function.
 */
export interface ConsoleManifest {
  /** Unique manifest identifier (should match module id) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Brief description */
  description?: string;
  /** Dependencies on other manifests (by id) */
  dependencies?: string[];

  /**
   * Static operations declaration
   * Categories and operations to register
   */
  ops?: OpsDeclaration;

  /**
   * Static data stores declaration
   * Zustand stores to register
   */
  data?: DataStoreRegistration[];

  /**
   * Dynamic registration function (escape hatch)
   * Called after static declarations are processed.
   * Use for dynamic imports, complex registration logic, etc.
   */
  register?: (ctx: ManifestRegistrationContext) => void | Promise<void>;
}

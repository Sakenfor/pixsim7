/**
 * Console Manifest Helpers
 *
 * Utilities to reduce boilerplate in ops definitions.
 */

import type { Operation, OperationParam } from '../opsRegistry';

import type { OperationDeclaration } from './types';

/**
 * Helper to create a parameter definition
 */
export function param(
  name: string,
  type: string,
  required?: boolean,
  description?: string
): OperationParam {
  return { name, type, required: required ?? true, description };
}

/**
 * Helper to create optional parameter
 */
export function optParam(name: string, type: string, description?: string): OperationParam {
  return { name, type, required: false, description };
}

/**
 * Simplified operation definition for categoryOps
 */
export interface OpDef {
  name: string;
  description: string;
  execute: (...args: unknown[]) => unknown;
  params?: OperationParam[];
}

/**
 * Helper to create multiple operations for a category without repeating categoryId
 *
 * @example
 * ```ts
 * ops: {
 *   categories: [{ id: 'stats', name: 'Stats', description: '...' }],
 *   operations: categoryOps('stats', {
 *     list: {
 *       name: 'List Stats',
 *       description: 'List all stats',
 *       execute: () => { ... },
 *     },
 *     get: {
 *       name: 'Get Stat',
 *       description: 'Get a stat by ID',
 *       execute: (id) => { ... },
 *       params: [param('id', 'string', true, 'Stat ID')],
 *     },
 *   }),
 * }
 * ```
 */
export function categoryOps(
  categoryId: string,
  opsMap: Record<string, OpDef>
): OperationDeclaration[] {
  return Object.entries(opsMap).map(([id, def]) => ({
    categoryId,
    op: {
      id,
      name: def.name,
      description: def.description,
      execute: def.execute,
      params: def.params,
    } as Operation,
  }));
}

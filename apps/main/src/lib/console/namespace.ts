/**
 * Pixsim Console Namespace
 *
 * Blender-style command interface for pixsim.
 * Provides dynamic access to:
 *   - pixsim.context - Current editor state (world, scene, runtime, workspace, editor)
 *   - pixsim.data - All data stores (dynamically registered)
 *   - pixsim.ops - Operations (dynamically registered, grouped by category)
 *
 * Usage examples:
 *   pixsim.context.scene.id
 *   pixsim.data.workspace.activePresetId
 *   pixsim.ops.scene.create({ title: 'New Scene' })
 *
 * Help:
 *   pixsim.data.__keys__ - List all data stores
 *   pixsim.ops.__keys__ - List all operation categories
 *   pixsim.ops.scene.__keys__ - List operations in scene category
 */

import { dataRegistry } from './dataRegistry';
import { opsRegistry } from './opsRegistry';
import type { EditorContext } from '../context/editorContext';

/** Function to get current editor context (set during initialization) */
let getEditorContext: (() => EditorContext) | null = null;

/**
 * Initialize the namespace with context provider
 */
export function initializeNamespace(contextGetter: () => EditorContext): void {
  getEditorContext = contextGetter;
}

/**
 * Create a deep proxy that always reads fresh values, even for nested objects.
 *
 * This ensures that even if you store a reference like:
 *   const scene = pixsim.context.scene;
 * Accessing scene.id will still read the current value, not a stale snapshot.
 */
function createDeepProxy<T extends object>(
  getValue: () => T,
  path: string[] = []
): T {
  return new Proxy({} as T, {
    get(_target, prop: string) {
      // Navigate to current value at this path
      let current: unknown = getValue();
      for (const key of path) {
        if (current && typeof current === 'object') {
          current = (current as Record<string, unknown>)[key];
        } else {
          return undefined;
        }
      }

      if (!current || typeof current !== 'object') {
        return undefined;
      }

      const value = (current as Record<string, unknown>)[prop];

      // If value is a plain object (not array, not null), return a nested proxy
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return createDeepProxy(getValue, [...path, prop]);
      }

      // For primitives and arrays, return the value directly
      return value;
    },

    has(_target, prop: string) {
      let current: unknown = getValue();
      for (const key of path) {
        if (current && typeof current === 'object') {
          current = (current as Record<string, unknown>)[key];
        } else {
          return false;
        }
      }
      return current && typeof current === 'object' && prop in current;
    },

    ownKeys() {
      let current: unknown = getValue();
      for (const key of path) {
        if (current && typeof current === 'object') {
          current = (current as Record<string, unknown>)[key];
        } else {
          return [];
        }
      }
      return current && typeof current === 'object' ? Object.keys(current) : [];
    },

    getOwnPropertyDescriptor(_target, prop: string) {
      let current: unknown = getValue();
      for (const key of path) {
        if (current && typeof current === 'object') {
          current = (current as Record<string, unknown>)[key];
        } else {
          return undefined;
        }
      }

      if (current && typeof current === 'object' && prop in current) {
        const value = (current as Record<string, unknown>)[prop];
        return { configurable: true, enumerable: true, value };
      }
      return undefined;
    },
  });
}

/**
 * Create a proxy for the context object that always returns fresh values.
 * Uses lazy initialization since getEditorContext may not be set at creation time.
 */
function createContextProxy(): EditorContext {
  return new Proxy({} as EditorContext, {
    get(_target, prop: string) {
      if (!getEditorContext) {
        console.warn('[pixsim.context] Namespace not initialized. Call initializeNamespace() first.');
        return undefined;
      }

      const ctx = getEditorContext();
      const value = ctx[prop as keyof EditorContext];

      // If value is a plain object, return a deep proxy for live access
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return createDeepProxy(getEditorContext, [prop]);
      }

      return value;
    },

    has(_target, prop: string) {
      return ['world', 'scene', 'runtime', 'workspace', 'editor'].includes(prop);
    },

    ownKeys() {
      return ['world', 'scene', 'runtime', 'workspace', 'editor'];
    },

    getOwnPropertyDescriptor(_target, prop: string) {
      if (['world', 'scene', 'runtime', 'workspace', 'editor'].includes(prop)) {
        if (!getEditorContext) return undefined;
        const ctx = getEditorContext();
        return { configurable: true, enumerable: true, value: ctx[prop as keyof EditorContext] };
      }
      return undefined;
    },
  });
}

/**
 * The pixsim namespace object
 */
export interface PixsimNamespace {
  /** Current editor context */
  context: EditorContext;
  /** All data stores */
  data: Record<string, unknown>;
  /** Operations grouped by category */
  ops: Record<string, Record<string, (...args: unknown[]) => unknown>>;
  /** Version info */
  version: string;
  /** Help function */
  help: () => void;
}

/**
 * Create the pixsim namespace
 */
export function createPixsimNamespace(): PixsimNamespace {
  return {
    context: createContextProxy(),
    data: dataRegistry.createProxy(),
    ops: opsRegistry.createProxy() as Record<string, Record<string, (...args: unknown[]) => unknown>>,
    version: '1.0.0',
    help: () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║                   PIXSIM CONSOLE                           ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  pixsim.context    Current editor state                    ║
║    .world          World/location context                  ║
║    .scene          Active scene and selection              ║
║    .runtime        Game runtime state                      ║
║    .workspace      Workspace preset and panels             ║
║    .editor         Primary view and mode                   ║
║                                                            ║
║  pixsim.data       All data stores                         ║
║    .__keys__       List available stores                   ║
║    .<store>        Access store state                      ║
║                                                            ║
║  pixsim.ops        Operations by category                  ║
║    .__keys__       List categories                         ║
║    .<cat>.__keys__ List operations in category             ║
║    .<cat>.<op>()   Execute operation                       ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
      `);
    },
  };
}

// Re-export registries for plugins to use
export { dataRegistry } from './dataRegistry';
export { opsRegistry } from './opsRegistry';

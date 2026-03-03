/**
 * HMR-safe factories for React contexts and module-level singletons.
 *
 * During Vite HMR, module re-evaluation creates fresh instances of
 * `createContext()` results, Maps, class instances, etc. Providers use
 * the new identity but consumers (especially in dockview portals) still
 * subscribe to the old one — silently breaking the provider/consumer
 * relationship.
 *
 * These utilities cache instances on `globalThis` via `Symbol.for()` so
 * the same object identity is returned across module re-evaluations.
 *
 * @example
 * ```ts
 * // Instead of:
 * const MyContext = createContext<Foo | null>(null);
 *
 * // Use:
 * const MyContext = createHmrSafeContext<Foo | null>('myFeature:myContext', null);
 * ```
 */
import { createContext } from 'react';

/**
 * Create a React context that survives HMR module re-evaluation.
 * The context object is cached on `globalThis[Symbol.for(key)]` so
 * providers and consumers always reference the same identity.
 */
export function createHmrSafeContext<T>(key: string, defaultValue: T): React.Context<T> {
  const sym = Symbol.for(`pixsim7:ctx:${key}`);
  return ((globalThis as any)[sym] ??= createContext<T>(defaultValue));
}

/**
 * Cache a module-level singleton on `globalThis` so it survives HMR.
 * The factory is only called on the first evaluation; subsequent
 * re-evaluations return the cached instance.
 *
 * @example
 * ```ts
 * const myStore = hmrSingleton('myFeature:store', () => createMyStore());
 * ```
 */
export function hmrSingleton<T>(key: string, factory: () => T): T {
  const sym = Symbol.for(`pixsim7:${key}`);
  return ((globalThis as any)[sym] ??= factory());
}

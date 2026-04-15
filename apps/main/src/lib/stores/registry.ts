/**
 * Store registry: central audit + cleanup for persisted app state.
 *
 * Covers Zustand-persist stores, dockview layout snapshots, and any other
 * module that writes to localStorage. Two concerns are tracked:
 *
 *   1. Deprecated keys  — old patterns to wipe on boot (migrations away
 *      from bad keys, renamed namespaces, stale per-* buckets).
 *   2. Managed prefixes — namespaces we fully own. Any localStorage key
 *      matching a managed prefix that is not claimed by a registered
 *      store is pruned as an orphan.
 *
 * Ownership registration via `registerStore` is optional at first — start
 * by declaring deprecated patterns, tighten over time.
 */

export interface StoreOwnership {
  /** Unique identifier for this store. Duplicates log a warning. */
  id: string;
  /** The exact localStorage key this store writes to. */
  key: string;
}

export interface ManagedPrefixConfig {
  /** Namespace prefix (e.g. 'dockview:', 'pixsim:gestures:'). */
  prefix: string;
  /**
   * If true, any localStorage key under this prefix that is not claimed by
   * a registered store is deleted on `pruneOrphans()`. Default false — opt
   * in per namespace once coverage is complete.
   */
  pruneOrphans?: boolean;
}

const _ownedKeys = new Map<string, StoreOwnership>();
const _deprecatedPatterns: Array<string | RegExp> = [];
const _managedPrefixes = new Map<string, ManagedPrefixConfig>();

function isLocalStorageAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

export function registerStore(registration: StoreOwnership): void {
  const existing = _ownedKeys.get(registration.id);
  if (existing) {
    if (existing.key !== registration.key) {
      console.warn(
        `[stores/registry] "${registration.id}" re-registered with different key ` +
          `("${existing.key}" → "${registration.key}"). Keeping the latest.`,
      );
    }
  }
  _ownedKeys.set(registration.id, registration);
}

export function registerDeprecatedKeys(patterns: ReadonlyArray<string | RegExp>): void {
  for (const pattern of patterns) {
    _deprecatedPatterns.push(pattern);
  }
}

export function registerManagedPrefix(config: ManagedPrefixConfig): void {
  const existing = _managedPrefixes.get(config.prefix);
  if (existing && existing.pruneOrphans && !config.pruneOrphans) return;
  _managedPrefixes.set(config.prefix, config);
}

export function listRegisteredStores(): ReadonlyArray<StoreOwnership> {
  return Array.from(_ownedKeys.values());
}

function matchesDeprecated(key: string): boolean {
  for (const pattern of _deprecatedPatterns) {
    if (typeof pattern === 'string' ? pattern === key : pattern.test(key)) return true;
  }
  return false;
}

function findOrphanPrefix(key: string, ownedKeys: ReadonlySet<string>): string | null {
  if (ownedKeys.has(key)) return null;
  for (const config of _managedPrefixes.values()) {
    if (!config.pruneOrphans) continue;
    if (key.startsWith(config.prefix)) return config.prefix;
  }
  return null;
}

export interface PruneResult {
  removed: string[];
  deprecatedRemoved: number;
  orphansRemoved: number;
}

/**
 * Wipe localStorage entries that match any registered deprecated pattern
 * or that fall under a managed prefix without a registered owner.
 *
 * Safe to call multiple times; subsequent calls only remove newly-matched
 * keys. Intended for one call at app bootstrap.
 */
export function pruneOrphans(): PruneResult {
  const result: PruneResult = { removed: [], deprecatedRemoved: 0, orphansRemoved: 0 };
  if (!isLocalStorageAvailable()) return result;

  const ownedKeys = new Set(Array.from(_ownedKeys.values()).map((reg) => reg.key));

  const toRemoveDeprecated: string[] = [];
  const toRemoveOrphan: string[] = [];

  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (matchesDeprecated(key)) {
        toRemoveDeprecated.push(key);
        continue;
      }
      const orphanPrefix = findOrphanPrefix(key, ownedKeys);
      if (orphanPrefix) toRemoveOrphan.push(key);
    }

    for (const key of toRemoveDeprecated) {
      localStorage.removeItem(key);
      result.removed.push(key);
      result.deprecatedRemoved += 1;
    }
    for (const key of toRemoveOrphan) {
      localStorage.removeItem(key);
      result.removed.push(key);
      result.orphansRemoved += 1;
    }
  } catch {
    // ignore storage errors
  }

  return result;
}

/**
 * Debug helper — returns a snapshot of registered state without mutating.
 */
export function inspectRegistry() {
  return {
    stores: listRegisteredStores(),
    deprecatedPatternCount: _deprecatedPatterns.length,
    managedPrefixes: Array.from(_managedPrefixes.values()),
  };
}

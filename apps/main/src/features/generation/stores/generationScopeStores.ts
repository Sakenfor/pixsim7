import { hmrSingleton } from '@lib/utils';

import type { GenerationInputStoreHook } from "./generationInputStore";
import { createGenerationInputStore } from "./generationInputStore";
import type { GenerationSessionStoreHook } from "./generationSessionStore";
import type { GenerationSettingsState } from "./generationSettingsStore";
import { createGenerationSettingsStore } from "./generationSettingsStore";

export type GenerationSettingsStoreHook = <T>(
  selector: (state: GenerationSettingsState) => T
) => T;

// Persist scope store Maps across HMR module re-evaluations.
const settingsStores = hmrSingleton('generationScopes:settings', () => new Map<string, GenerationSettingsStoreHook>());
const inputStores = hmrSingleton('generationScopes:input', () => new Map<string, GenerationInputStoreHook>());


function normalizeScopeStorageId(scopeId: string): string {
  if (!scopeId || typeof scopeId !== 'string') return scopeId;
  const parts = scopeId.split(':');
  if (parts.length === 2 && parts[0] === parts[1]) {
    return parts[0];
  }
  return scopeId;
}

function getStorageKey(prefix: string, scopeId: string) {
  return `${prefix}:${normalizeScopeStorageId(scopeId)}`;
}

function migrateLegacyDuplicateScopedKey(prefix: string, scopeId: string): void {
  if (typeof localStorage === 'undefined') return;
  const normalizedScopeId = normalizeScopeStorageId(scopeId);
  if (normalizedScopeId === scopeId) return;

  const legacyKey = `${prefix}:${scopeId}`;
  const normalizedKey = `${prefix}:${normalizedScopeId}`;
  try {
    const legacyRaw = localStorage.getItem(legacyKey);
    if (!legacyRaw) return;
    const normalizedRaw = localStorage.getItem(normalizedKey);
    if (!normalizedRaw) {
      localStorage.setItem(normalizedKey, legacyRaw);
    }
    localStorage.removeItem(legacyKey);
  } catch {
    // Best-effort migration only.
  }
}

function collapseDuplicateScopedStorageKeys(): number {
  if (typeof localStorage === 'undefined') return 0;
  let removed = 0;
  const allKeys = Object.keys(localStorage);
  for (const key of allKeys) {
    for (const prefix of SCOPED_PREFIXES) {
      if (!key.startsWith(prefix)) continue;
      const rawScopeId = key.slice(prefix.length);
      const normalizedScopeId = normalizeScopeStorageId(rawScopeId);
      if (normalizedScopeId === rawScopeId) break;

      const normalizedKey = `${prefix}${normalizedScopeId}`;
      try {
        const raw = localStorage.getItem(key);
        if (raw && !localStorage.getItem(normalizedKey)) {
          localStorage.setItem(normalizedKey, raw);
        }
        localStorage.removeItem(key);
        removed++;
      } catch {
        // Ignore malformed keys/values.
      }
      break;
    }
  }
  return removed;
}

/**
 * Session store is now a shim over the settings store.
 * The settings store contains all session fields (prompt, operationType, etc.)
 * so we just cast it — the types are compatible because GenerationSettingsState
 * now implements all GenerationSessionFields + GenerationSessionActions.
 */
export function getGenerationSessionStore(scopeId: string): GenerationSessionStoreHook {
  return getGenerationSettingsStore(scopeId) as unknown as GenerationSessionStoreHook;
}

export function getGenerationSettingsStore(scopeId: string): GenerationSettingsStoreHook {
  const normalizedScopeId = normalizeScopeStorageId(scopeId);
  const existing =
    settingsStores.get(normalizedScopeId)
    ?? (normalizedScopeId !== scopeId ? settingsStores.get(scopeId) : undefined);
  if (existing) return existing;

  migrateLegacyDuplicateScopedKey("generation_settings", scopeId);
  const store = createGenerationSettingsStore(
    getStorageKey("generation_settings", scopeId),
    localStorage,
  );
  settingsStores.set(normalizedScopeId, store);
  return store;
}

export function getGenerationInputStore(scopeId: string): GenerationInputStoreHook {
  const normalizedScopeId = normalizeScopeStorageId(scopeId);
  const existing =
    inputStores.get(normalizedScopeId)
    ?? (normalizedScopeId !== scopeId ? inputStores.get(scopeId) : undefined);
  if (existing) return existing;

  migrateLegacyDuplicateScopedKey("generation_inputs", scopeId);
  const store = createGenerationInputStore(
    getStorageKey("generation_inputs", scopeId),
  );
  inputStores.set(normalizedScopeId, store);
  return store;
}

/**
 * Returns all registered scoped input stores (does NOT include the global singleton).
 * Combine with useGenerationInputStore for full coverage.
 */
export function getRegisteredInputStores(): GenerationInputStoreHook[] {
  return Array.from(inputStores.values());
}

export function getRegisteredInputStoreEntries(): Array<{
  scopeId: string;
  store: GenerationInputStoreHook;
}> {
  return Array.from(inputStores.entries()).map(([scopeId, store]) => ({ scopeId, store }));
}

/**
 * Returns all registered scoped settings stores (does NOT include the global singleton).
 */
export function getRegisteredSettingsStores(): GenerationSettingsStoreHook[] {
  return Array.from(settingsStores.values());
}

export function getRegisteredSettingsStoreEntries(): Array<{
  scopeId: string;
  store: GenerationSettingsStoreHook;
}> {
  return Array.from(settingsStores.entries()).map(([scopeId, store]) => ({ scopeId, store }));
}

// ---------------------------------------------------------------------------
// Stale scope store pruning
// ---------------------------------------------------------------------------

const SCOPED_PREFIXES = ['generation_settings:', 'generation_inputs:'];
// Legacy prefixes from before the session→settings merge
const LEGACY_PREFIXES = ['generation_session:'];
const MAX_SCOPED_STORES = 32;
const PRUNE_MARKER_KEY = 'generation_scope_prune_ts';
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000; // once per day

/**
 * Remove stale scoped generation stores from localStorage.
 *
 * Keeps the MAX_SCOPED_STORES most recently modified scope IDs (based on
 * Zustand persist's internal version timestamp) and deletes the rest.
 * Also removes all legacy generation_session:* keys unconditionally.
 *
 * Called once on startup, throttled to once per day.
 */
export function pruneStaleGenerationStores(): number {
  try {
    const allKeys = Object.keys(localStorage);
    let removed = 0;

    // Remove all legacy session keys (they've been migrated into settings)
    for (const key of allKeys) {
      if (LEGACY_PREFIXES.some((p) => key.startsWith(p))) {
        localStorage.removeItem(key);
        removed++;
      }
    }

    // Collapse duplicated scope ids in persisted keys:
    // generation_settings:x:x -> generation_settings:x
    // generation_inputs:x:x -> generation_inputs:x
    removed += collapseDuplicateScopedStorageKeys();

    // In dev, HMR can produce temporary scope IDs while panels remount.
    // Skipping aggressive prune avoids accidentally deleting active scopes.
    if (import.meta.env.DEV) {
      return removed;
    }

    const lastPrune = Number(localStorage.getItem(PRUNE_MARKER_KEY) || '0');
    if (Date.now() - lastPrune < PRUNE_INTERVAL_MS) return removed;

    const scopedKeys = Object.keys(localStorage);

    // Collect scoped keys grouped by scope ID
    const scopeLastModified = new Map<string, number>();
    const scopeKeys = new Map<string, string[]>();

    for (const key of scopedKeys) {
      for (const prefix of SCOPED_PREFIXES) {
        if (key.startsWith(prefix)) {
          const scopeId = key.slice(prefix.length);
          if (!scopeKeys.has(scopeId)) scopeKeys.set(scopeId, []);
          scopeKeys.get(scopeId)!.push(key);

          // Use the Zustand persisted state's version as a rough age proxy.
          // If we can't parse it, assume it's old (timestamp 0).
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw);
              // Zustand persist stores { state, version }. The version number
              // doesn't change, but we can check if the state has content.
              const hasContent =
                parsed?.state &&
                Object.keys(parsed.state).length > 0;
              if (hasContent) {
                scopeLastModified.set(
                  scopeId,
                  Math.max(scopeLastModified.get(scopeId) ?? 0, 1),
                );
              }
            }
          } catch { /* ignore parse errors */ }

          break;
        }
      }
    }

    // Keep the most recently active scopes, delete the rest
    if (scopeKeys.size > MAX_SCOPED_STORES) {
      // Sort scopes: those with content first, then the rest
      const sortedScopes = [...scopeKeys.keys()].sort((a, b) => {
        return (scopeLastModified.get(b) ?? 0) - (scopeLastModified.get(a) ?? 0);
      });

      const toDelete = sortedScopes.slice(MAX_SCOPED_STORES);
      for (const scopeId of toDelete) {
        for (const key of scopeKeys.get(scopeId) ?? []) {
          localStorage.removeItem(key);
          removed++;
        }
      }
    }

    localStorage.setItem(PRUNE_MARKER_KEY, String(Date.now()));
    return removed;
  } catch {
    return 0;
  }
}

// Normalize duplicate scoped key shapes once at module boot/HMR.
hmrSingleton('generationScopes:normalizeDuplicateKeys', () => {
  collapseDuplicateScopedStorageKeys();
  return true;
});

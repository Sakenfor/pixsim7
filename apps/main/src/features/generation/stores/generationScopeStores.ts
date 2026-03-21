import type { GenerationInputStoreHook } from "./generationInputStore";
import { createGenerationInputStore } from "./generationInputStore";
import type { GenerationSessionStoreHook } from "./generationSessionStore";
import type { GenerationSettingsState } from "./generationSettingsStore";
import { createGenerationSettingsStore } from "./generationSettingsStore";

export type GenerationSettingsStoreHook = <T>(
  selector: (state: GenerationSettingsState) => T
) => T;

import { hmrSingleton } from '@lib/utils';

// Persist scope store Maps across HMR module re-evaluations.
const settingsStores = hmrSingleton('generationScopes:settings', () => new Map<string, GenerationSettingsStoreHook>());
const inputStores = hmrSingleton('generationScopes:input', () => new Map<string, GenerationInputStoreHook>());


function getStorageKey(prefix: string, scopeId: string) {
  return `${prefix}:${scopeId}`;
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
  const existing = settingsStores.get(scopeId);
  if (existing) return existing;

  const store = createGenerationSettingsStore(
    getStorageKey("generation_settings", scopeId),
    localStorage,
  );
  settingsStores.set(scopeId, store);
  return store;
}

export function getGenerationInputStore(scopeId: string): GenerationInputStoreHook {
  const existing = inputStores.get(scopeId);
  if (existing) return existing;

  const store = createGenerationInputStore(
    getStorageKey("generation_inputs", scopeId),
  );
  inputStores.set(scopeId, store);
  return store;
}

/**
 * Returns all registered scoped input stores (does NOT include the global singleton).
 * Combine with useGenerationInputStore for full coverage.
 */
export function getRegisteredInputStores(): GenerationInputStoreHook[] {
  return Array.from(inputStores.values());
}

/**
 * Returns all registered scoped settings stores (does NOT include the global singleton).
 */
export function getRegisteredSettingsStores(): GenerationSettingsStoreHook[] {
  return Array.from(settingsStores.values());
}

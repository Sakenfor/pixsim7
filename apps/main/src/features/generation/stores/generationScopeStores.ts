import type { GenerationInputStoreHook } from "./generationInputStore";
import { createGenerationInputStore } from "./generationInputStore";
import type { GenerationSessionStoreHook } from "./generationSessionStore";
import { createGenerationSessionStore } from "./generationSessionStore";
import type { GenerationSettingsState } from "./generationSettingsStore";
import { createGenerationSettingsStore } from "./generationSettingsStore";

export type GenerationSettingsStoreHook = <T>(
  selector: (state: GenerationSettingsState) => T
) => T;

// Persist scope store Maps across HMR module re-evaluations.
// Without this, re-evaluation creates fresh empty Maps and panels that
// survived HMR (via dockview stabilization) get new empty stores instead
// of their existing populated ones.
const _hmrKey = Symbol.for('pixsim7:generationScopes');
const _hmrState = ((globalThis as any)[_hmrKey] ??= {}) as {
  sessionStores?: Map<string, GenerationSessionStoreHook>;
  settingsStores?: Map<string, GenerationSettingsStoreHook>;
  inputStores?: Map<string, GenerationInputStoreHook>;
};
const sessionStores = (_hmrState.sessionStores ??= new Map());
const settingsStores = (_hmrState.settingsStores ??= new Map());
const inputStores = (_hmrState.inputStores ??= new Map());


function getStorageKey(prefix: string, scopeId: string) {
  return `${prefix}:${scopeId}`;
}

export function getGenerationSessionStore(scopeId: string): GenerationSessionStoreHook {
  const existing = sessionStores.get(scopeId);
  if (existing) return existing;

  const store = createGenerationSessionStore(getStorageKey("generation_session", scopeId));
  sessionStores.set(scopeId, store);
  return store;
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

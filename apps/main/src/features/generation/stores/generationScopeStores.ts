import { createJSONStorage } from "zustand/middleware";

import type { GenerationInputStoreHook } from "./generationInputStore";
import { createGenerationInputStore } from "./generationInputStore";
import type { GenerationSessionStoreHook } from "./generationSessionStore";
import { createGenerationSessionStore } from "./generationSessionStore";
import type { GenerationSettingsState } from "./generationSettingsStore";
import { createGenerationSettingsStore } from "./generationSettingsStore";

export type GenerationSettingsStoreHook = <T>(
  selector: (state: GenerationSettingsState) => T
) => T;

const sessionStores = new Map<string, GenerationSessionStoreHook>();
const settingsStores = new Map<string, GenerationSettingsStoreHook>();
const inputStores = new Map<string, GenerationInputStoreHook>();

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
    createJSONStorage(() => localStorage),
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

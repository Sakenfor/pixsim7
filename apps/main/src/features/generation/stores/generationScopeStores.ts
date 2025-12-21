import { createJSONStorage } from "zustand/middleware";
import type { GenerationSettingsState } from "./generationSettingsStore";
import { createGenerationSettingsStore } from "./generationSettingsStore";
import type { GenerationSessionStoreHook } from "./generationSessionStore";
import { createGenerationSessionStore } from "./generationSessionStore";

export type GenerationSettingsStoreHook = <T>(
  selector: (state: GenerationSettingsState) => T
) => T;

const sessionStores = new Map<string, GenerationSessionStoreHook>();
const settingsStores = new Map<string, GenerationSettingsStoreHook>();

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

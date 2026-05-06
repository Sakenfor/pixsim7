/**
 * Ticker settings store — global, not per-dock.
 *
 * Persisted via `createBackendStorage` so the same config follows the user
 * across devices (and will be reusable from any future ticker surface beyond
 * Control Center, e.g. a status bar).
 *
 * Per `backend-storage-clear-gotcha` memory: clearing localStorage doesn't
 * fully reset; backend user-prefs hydrates back. Avoid relying on field
 * presence — always allow defaults at read time.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createBackendStorage } from '@lib/utils/storage';
import {
  exposeStoreForDebugging,
  manuallyRehydrateStore,
} from '@lib/utils/zustandPersist';

import type { TickerSource } from '../lib/sourceRegistry';

const STORAGE_KEY = 'ticker_settings_v1';

interface TickerSettingsState {
  /** sourceId → enabled. Missing key → fall back to source.defaultEnabled. */
  enabledSources: Record<string, boolean>;
  /** sourceId → opaque per-source settings blob owned by the source. */
  sourceSettings: Record<string, unknown>;

  setSourceEnabled: (sourceId: string, enabled: boolean) => void;
  toggleSourceEnabled: (sourceId: string, fallback?: boolean) => void;
  setSourceSettings: (sourceId: string, settings: unknown) => void;
}

export const useTickerSettingsStore = create<TickerSettingsState>()(
  persist(
    (set, get) => ({
      enabledSources: {},
      sourceSettings: {},

      setSourceEnabled: (sourceId, enabled) =>
        set((state) => ({
          enabledSources: { ...state.enabledSources, [sourceId]: enabled },
        })),

      toggleSourceEnabled: (sourceId, fallback = false) => {
        const current = get().enabledSources[sourceId];
        const next = typeof current === 'boolean' ? !current : !fallback;
        set((state) => ({
          enabledSources: { ...state.enabledSources, [sourceId]: next },
        }));
      },

      setSourceSettings: (sourceId, settings) =>
        set((state) => ({
          sourceSettings: { ...state.sourceSettings, [sourceId]: settings },
        })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => createBackendStorage('tickerSettings')),
      skipHydration: false,
      partialize: (state) => ({
        enabledSources: state.enabledSources,
        sourceSettings: state.sourceSettings,
      }),
      version: 1,
    },
  ),
);

if (typeof window !== 'undefined') {
  exposeStoreForDebugging(useTickerSettingsStore, 'tickerSettings');
  setTimeout(() => {
    manuallyRehydrateStore(
      useTickerSettingsStore,
      'tickerSettings_local',
      'TickerSettings',
    );
  }, 50);
}

/**
 * Resolve whether a source should currently subscribe — explicit user choice
 * if set, otherwise the source's `defaultEnabled`. Stable selector so it can
 * be called from both React (selector) and non-React contexts.
 */
export function isSourceEnabled(
  state: Pick<TickerSettingsState, 'enabledSources'>,
  source: Pick<TickerSource, 'id' | 'defaultEnabled'>,
): boolean {
  const explicit = state.enabledSources[source.id];
  if (typeof explicit === 'boolean') return explicit;
  return source.defaultEnabled ?? false;
}

/** Read per-source settings with a typed default. */
export function getSourceSettings<T>(
  state: Pick<TickerSettingsState, 'sourceSettings'>,
  sourceId: string,
  defaults: T,
): T {
  const stored = state.sourceSettings[sourceId];
  if (stored && typeof stored === 'object') {
    return { ...defaults, ...(stored as Record<string, unknown>) } as T;
  }
  return defaults;
}

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { debugFlags } from '@lib/utils/debugFlags';
import { createBackendStorage } from '@lib/utils/storage';
import { exposeStoreForDebugging, manuallyRehydrateStore } from '@lib/utils/zustandPersist';

const STORAGE_KEY = 'dock_panel_prefs_v1';
const EMPTY_PREFS: Record<string, boolean> = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readLegacyControlCenterEnabledModules(): Record<string, boolean> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = localStorage.getItem('controlCenter_local');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.state)) {
      return null;
    }
    const enabledModules = parsed.state.enabledModules;
    if (!isRecord(enabledModules)) {
      return null;
    }

    const result: Record<string, boolean> = {};
    for (const [panelId, enabled] of Object.entries(enabledModules)) {
      if (typeof enabled === 'boolean') {
        result[panelId] = enabled;
      }
    }
    return result;
  } catch (error) {
    debugFlags.warn(
      'rehydration',
      '[DockPanelPrefsStore] Failed to read legacy Control Center panel preferences:',
      error,
    );
    return null;
  }
}

function getInitialPanelPrefsByDock(): Record<string, Record<string, boolean>> {
  const legacyEnabledModules = readLegacyControlCenterEnabledModules();
  if (!legacyEnabledModules) {
    return {};
  }

  return {
    'control-center': legacyEnabledModules,
  };
}

function shallowEqualRecord(
  a: Record<string, boolean>,
  b: Record<string, boolean>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export interface DockPanelPrefsStoreState {
  panelPrefsByDock: Record<string, Record<string, boolean>>;
  setDockPanelEnabled: (dockId: string, panelId: string, enabled: boolean) => void;
  setDockPanelPrefs: (dockId: string, prefs: Record<string, boolean>) => void;
  resetDockPanelPrefs: (dockId: string) => void;
}

export function getDockPanelPrefsSnapshot(
  state: Pick<DockPanelPrefsStoreState, 'panelPrefsByDock'>,
  dockId: string,
): Record<string, boolean> {
  return state.panelPrefsByDock[dockId] ?? EMPTY_PREFS;
}

export function useDockPanelPrefs<T>(
  dockId: string,
  selector: (prefs: Record<string, boolean>) => T,
): T {
  return useDockPanelPrefsStore((state) => selector(getDockPanelPrefsSnapshot(state, dockId)));
}

export const useDockPanelPrefsStore = create<DockPanelPrefsStoreState>()(
  persist(
    (set) => ({
      panelPrefsByDock: getInitialPanelPrefsByDock(),

      setDockPanelEnabled: (dockId, panelId, enabled) =>
        set((state) => {
          const currentDockPrefs = state.panelPrefsByDock[dockId] ?? EMPTY_PREFS;
          if (currentDockPrefs[panelId] === enabled) {
            return state;
          }

          return {
            panelPrefsByDock: {
              ...state.panelPrefsByDock,
              [dockId]: {
                ...currentDockPrefs,
                [panelId]: enabled,
              },
            },
          };
        }),

      setDockPanelPrefs: (dockId, prefs) =>
        set((state) => {
          const currentDockPrefs = state.panelPrefsByDock[dockId] ?? EMPTY_PREFS;
          if (shallowEqualRecord(currentDockPrefs, prefs)) {
            return state;
          }

          return {
            panelPrefsByDock: {
              ...state.panelPrefsByDock,
              [dockId]: { ...prefs },
            },
          };
        }),

      resetDockPanelPrefs: (dockId) =>
        set((state) => {
          if (!(dockId in state.panelPrefsByDock)) {
            return state;
          }

          const nextPrefs = { ...state.panelPrefsByDock };
          delete nextPrefs[dockId];
          return {
            panelPrefsByDock: nextPrefs,
          };
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => createBackendStorage('dockPanelPrefs')),
      skipHydration: false,
      partialize: (state) => ({
        panelPrefsByDock: state.panelPrefsByDock,
      }),
      version: 1,
      migrate: (persistedState) => {
        if (
          persistedState &&
          typeof persistedState === 'object' &&
          'panelPrefsByDock' in persistedState &&
          persistedState.panelPrefsByDock &&
          typeof persistedState.panelPrefsByDock === 'object'
        ) {
          return persistedState as any;
        }

        return {
          panelPrefsByDock: getInitialPanelPrefsByDock(),
        };
      },
    },
  ),
);

if (typeof window !== 'undefined') {
  exposeStoreForDebugging(useDockPanelPrefsStore, 'dockPanelPrefs');

  setTimeout(() => {
    manuallyRehydrateStore(
      useDockPanelPrefsStore,
      'dockPanelPrefs_local',
      'DockPanelPrefs',
    );
  }, 50);
}

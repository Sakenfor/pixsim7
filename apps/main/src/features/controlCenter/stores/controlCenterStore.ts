import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createBackendStorage } from '@lib/utils/storage';
import { exposeStoreForDebugging, manuallyRehydrateStore } from '@lib/utils/zustandPersist';

import {
  useDockPanelPrefsStore,
  useDockUiStore,
  type DockPosition,
  type LayoutBehavior,
  type RetractedMode,
} from '@features/docks/stores';
import { DOCK_IDS } from '@features/panels/lib/panelIds';


export type { DockPosition, LayoutBehavior, RetractedMode };

export type ControlModule =
  | 'quickGenerate'
  | 'providers'
  | 'panels'
  | 'presets'
  | 'none'
  | (string & {});

export interface ControlCenterState {
  activeModule: ControlModule;
  conformToOtherPanels: boolean;
}

/**
 * Compatibility actions:
 * These keep imperative callers working while generic dock state lives in
 * useDockUiStore/useDockPanelPrefsStore.
 */
export interface ControlCenterActions {
  setActiveModule: (module: ControlModule) => void;
  setConformToOtherPanels: (conform: boolean) => void;
  reset: () => void;

  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setPinned: (pinned: boolean) => void;
  setHeight: (size: number) => void;
  setDockPosition: (position: DockPosition) => void;
  setLayoutBehavior: (behavior: LayoutBehavior) => void;
  setRetractedMode: (mode: RetractedMode) => void;
  setFloatingPosition: (x: number, y: number) => void;
  setFloatingSize: (width: number, height: number) => void;
  setModuleEnabled: (moduleId: string, enabled: boolean) => void;
  triggerPanelLayoutReset: () => void;
}

interface LegacyControlCenterState {
  activeModule?: unknown;
  conformToOtherPanels?: unknown;
}

const STORAGE_KEY = 'control_center_meta_v1';
const CONTROL_CENTER_DOCK_ID = DOCK_IDS.controlCenter;

function readLegacyControlCenterState(): LegacyControlCenterState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = localStorage.getItem('controlCenter_local');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const state = parsed?.state;
    if (!state || typeof state !== 'object') {
      return null;
    }
    return state as LegacyControlCenterState;
  } catch {
    return null;
  }
}

function getInitialState(): ControlCenterState {
  const legacy = readLegacyControlCenterState();
  return {
    activeModule:
      typeof legacy?.activeModule === 'string'
        ? (legacy.activeModule as ControlModule)
        : 'quickGenerate',
    conformToOtherPanels:
      typeof legacy?.conformToOtherPanels === 'boolean'
        ? legacy.conformToOtherPanels
        : false,
  };
}

export const useControlCenterStore = create<ControlCenterState & ControlCenterActions>()(
  persist(
    (set, get) => ({
      ...getInitialState(),

      setActiveModule: (module) => {
        if (get().activeModule === module) return;
        set({ activeModule: module });
      },

      setConformToOtherPanels: (conform) => {
        if (get().conformToOtherPanels === conform) return;
        set({ conformToOtherPanels: conform });
      },

      reset: () =>
        set({
          activeModule: 'quickGenerate',
          conformToOtherPanels: false,
        }),

      setOpen: (open) => {
        useDockUiStore.getState().setDockOpen(CONTROL_CENTER_DOCK_ID, open);
      },

      toggleOpen: () => {
        useDockUiStore.getState().toggleDockOpen(CONTROL_CENTER_DOCK_ID);
      },

      setPinned: (pinned) => {
        useDockUiStore.getState().setDockPinned(CONTROL_CENTER_DOCK_ID, pinned);
      },

      setHeight: (size) => {
        useDockUiStore.getState().setDockSize(CONTROL_CENTER_DOCK_ID, size);
      },

      setDockPosition: (position) => {
        useDockUiStore.getState().setDockPosition(CONTROL_CENTER_DOCK_ID, position);
      },

      setLayoutBehavior: (behavior) => {
        useDockUiStore
          .getState()
          .setDockLayoutBehavior(CONTROL_CENTER_DOCK_ID, behavior);
      },

      setRetractedMode: (mode) => {
        useDockUiStore.getState().setDockRetractedMode(CONTROL_CENTER_DOCK_ID, mode);
      },

      setFloatingPosition: (x, y) => {
        useDockUiStore
          .getState()
          .setDockFloatingPosition(CONTROL_CENTER_DOCK_ID, x, y);
      },

      setFloatingSize: (width, height) => {
        useDockUiStore
          .getState()
          .setDockFloatingSize(CONTROL_CENTER_DOCK_ID, width, height);
      },

      setModuleEnabled: (moduleId, enabled) => {
        useDockPanelPrefsStore
          .getState()
          .setDockPanelEnabled(CONTROL_CENTER_DOCK_ID, moduleId, enabled);
      },

      triggerPanelLayoutReset: () => {
        useDockUiStore.getState().triggerDockLayoutReset(CONTROL_CENTER_DOCK_ID);
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => createBackendStorage('controlCenterMeta')),
      skipHydration: false,
      partialize: (state) => ({
        activeModule: state.activeModule,
        conformToOtherPanels: state.conformToOtherPanels,
      }),
      version: 1,
      migrate: (persistedState) => {
        if (
          persistedState &&
          typeof persistedState === 'object' &&
          'activeModule' in persistedState &&
          'conformToOtherPanels' in persistedState
        ) {
          return persistedState as any;
        }

        return getInitialState();
      },
    },
  ),
);

if (typeof window !== 'undefined') {
  exposeStoreForDebugging(useControlCenterStore, 'controlCenter');

  setTimeout(() => {
    manuallyRehydrateStore(
      useControlCenterStore,
      'controlCenterMeta_local',
      'ControlCenterMeta',
    );
  }, 50);
}

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { createBackendStorage } from '../lib/backendStorage';
import { debugFlags } from '../lib/debugFlags';
import { manuallyRehydrateStore, exposeStoreForDebugging } from '../lib/zustandPersistWorkaround';

export type ControlModule = 'quickGenerate' | 'providers' | 'panels' | 'none';
export type DockPosition = 'bottom' | 'left' | 'right' | 'top' | 'floating';
export type LayoutBehavior = 'overlay' | 'push';

/**
 * ControlCenterState contains UI-specific state for the Control Center dock.
 * Generation session state is now managed separately via useGenerationScopeStores().
 */
export interface ControlCenterState {
  dockPosition: DockPosition;
  layoutBehavior: LayoutBehavior;
  conformToOtherPanels: boolean;
  open: boolean;
  pinned: boolean;
  height: number;
  floatingPosition: { x: number; y: number };
  floatingSize: { width: number; height: number };
  activeModule: ControlModule;
  enabledModules: Record<string, boolean>;
  panelLayoutResetTrigger: number;
}

/**
 * ControlCenterActions contains UI-specific actions for the Control Center dock.
 */
export interface ControlCenterActions {
  setDockPosition: (position: DockPosition) => void;
  setLayoutBehavior: (behavior: LayoutBehavior) => void;
  setConformToOtherPanels: (conform: boolean) => void;
  toggleOpen: () => void;
  setOpen: (v: boolean) => void;
  setPinned: (v: boolean) => void;
  setHeight: (px: number) => void;
  setFloatingPosition: (x: number, y: number) => void;
  setFloatingSize: (width: number, height: number) => void;
  setActiveModule: (m: ControlModule) => void;
  setModuleEnabled: (moduleId: string, enabled: boolean) => void;
  triggerPanelLayoutReset: () => void;
  reset: () => void;
}

const STORAGE_KEY = 'control_center_v1';

export const useControlCenterStore = create<ControlCenterState & ControlCenterActions>()(
  persist(
    (set, get) => {
      debugFlags.log('stores', '[ControlCenterStore] Creating store with initial state');
      return {
        dockPosition: 'bottom',
        layoutBehavior: 'overlay',
        conformToOtherPanels: false,
        open: false,
        pinned: false,
        height: 300,
        floatingPosition: { x: window.innerWidth / 2 - 300, y: window.innerHeight / 2 - 250 },
        floatingSize: { width: 700, height: 600 },
        activeModule: 'quickGenerate',
        enabledModules: {},
        panelLayoutResetTrigger: 0,
        setLayoutBehavior: (behavior) => {
          if (get().layoutBehavior === behavior) return;
          set({ layoutBehavior: behavior });
        },
        setConformToOtherPanels: (conform) => {
          if (get().conformToOtherPanels === conform) return;
          set({ conformToOtherPanels: conform });
        },
        setDockPosition: (position) => {
          if (get().dockPosition === position) return;
          const currentPosition = get().dockPosition;
          const wasFloating = currentPosition === 'floating';

          const isVertical = position === 'left' || position === 'right';
          const newHeight = isVertical ? 450 : 300;

          const updates: Partial<ControlCenterState> = { dockPosition: position, height: newHeight };

          if (position === 'floating' || wasFloating) {
            updates.open = true;
            if (wasFloating && position !== 'floating') {
              updates.pinned = true;
            }
          }

          set(updates);
        },
        toggleOpen: () => set((s) => ({ open: !s.open })),
        setOpen: (v) => {
          if (get().open === v) return;
          set({ open: v });
        },
        setPinned: (v) => {
          if (get().pinned === v) return;
          set({ pinned: v });
        },
        setHeight: (px) => {
          const pos = get().dockPosition;
          const isVertical = pos === 'left' || pos === 'right';
          const min = isVertical ? 300 : 200;
          const max = isVertical ? 700 : 500;
          const next = Math.max(min, Math.min(max, px));
          if (get().height === next) return;
          set({ height: next });
        },
        setFloatingPosition: (x, y) => set({ floatingPosition: { x, y } }),
        setFloatingSize: (width, height) => set({ floatingSize: { width, height } }),
        setActiveModule: (m) => {
          if (get().activeModule === m) return;
          set({ activeModule: m });
        },
        setModuleEnabled: (moduleId, enabled) => {
          set((s) => ({
            enabledModules: { ...s.enabledModules, [moduleId]: enabled }
          }));
        },
        triggerPanelLayoutReset: () => set({ panelLayoutResetTrigger: Date.now() }),
        reset: () => set({
          dockPosition: 'bottom',
          layoutBehavior: 'overlay',
          conformToOtherPanels: false,
          open: false,
          pinned: false,
          height: 300,
          floatingPosition: { x: window.innerWidth / 2 - 300, y: window.innerHeight / 2 - 250 },
          floatingSize: { width: 700, height: 600 },
          activeModule: 'quickGenerate',
          enabledModules: {},
        })
      };
    },
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => createBackendStorage('controlCenter')),
      skipHydration: false,
      partialize: (s) => ({
        dockPosition: s.dockPosition,
        layoutBehavior: s.layoutBehavior,
        conformToOtherPanels: s.conformToOtherPanels,
        open: s.open,
        pinned: s.pinned,
        height: s.height,
        floatingPosition: s.floatingPosition,
        floatingSize: s.floatingSize,
        activeModule: s.activeModule,
        enabledModules: s.enabledModules,
      }),
      version: 11,
      migrate: (persistedState: any, version: number) => {
        const migrated = { ...persistedState };

        // Migrate from version 4 to 5: add floating position/size defaults
        if (version < 5) {
          migrated.floatingPosition = migrated.floatingPosition || { x: window.innerWidth / 2 - 300, y: window.innerHeight / 2 - 250 };
          migrated.floatingSize = migrated.floatingSize || { width: 600, height: 500 };
          if (migrated.dockPosition === 'floating') {
            migrated.open = true;
          }
        }

        // Migrate from version 5 to 6: add enabledModules and increase defaults
        if (version < 6) {
          migrated.enabledModules = migrated.enabledModules || {};
          if (migrated.height === 180) {
            migrated.height = 300;
          } else if (migrated.height === 320) {
            migrated.height = 450;
          }
          if (migrated.floatingSize?.width === 600) {
            migrated.floatingSize.width = 700;
          }
          if (migrated.floatingSize?.height === 500) {
            migrated.floatingSize.height = 600;
          }
        }

        // Migrate from version 6 to 7: add layoutBehavior
        if (version < 7) {
          migrated.layoutBehavior = migrated.layoutBehavior || 'overlay';
        }

        // Migrate from version 7 to 8: add conformToOtherPanels
        if (version < 8) {
          migrated.conformToOtherPanels = migrated.conformToOtherPanels ?? false;
        }

        // Migrate from version 10 to 11: remove generation fields (moved to separate store)
        if (version < 11) {
          delete migrated.operationType;
          delete migrated.prompt;
          delete migrated.promptPerOperation;
          delete migrated.providerId;
          delete migrated.presetId;
          delete migrated.presetParams;
          delete migrated.generating;
        }

        return migrated;
      },
      onRehydrateStorage: () => {
        debugFlags.log('rehydration', '[ControlCenterStore] onRehydrateStorage outer function called');
        return (state, error) => {
          debugFlags.log('rehydration', '[ControlCenterStore] onRehydrateStorage INNER callback called!', { state: !!state, error: !!error });

          try {
            if (error) {
              debugFlags.error('rehydration', '[ControlCenterStore] Rehydration error:', error);
              return;
            }

            if (state) {
              debugFlags.log('rehydration', '[ControlCenterStore] ✅ Rehydration complete! State received:', {
                dockPosition: state.dockPosition,
                open: state.open,
                pinned: state.pinned,
                floatingPosition: state.floatingPosition,
                floatingSize: state.floatingSize,
              });

              if (state.dockPosition === 'floating' && !state.open) {
                debugFlags.log('rehydration', '[ControlCenterStore] Setting floating mode to open');
                state.setOpen(true);
              }
            } else {
              debugFlags.warn('rehydration', '[ControlCenterStore] ⚠️ Rehydration returned no state (state is null/undefined)');
            }
          } catch (e) {
            debugFlags.error('rehydration', '[ControlCenterStore] ❌ Error in rehydration callback:', e);
          }
        };
      },
    }
  )
);

// Expose store to window for debugging and MANUALLY REHYDRATE (Zustand v5 bug workaround)
if (typeof window !== 'undefined') {
  exposeStoreForDebugging(useControlCenterStore, 'controlCenter');

  // Run manual rehydration after a short delay to ensure store is initialized
  setTimeout(() => {
    manuallyRehydrateStore(
      useControlCenterStore,
      'controlCenter_local',
      'ControlCenter'
    );
  }, 50);
}

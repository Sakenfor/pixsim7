import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { GenerationSessionFields, GenerationSessionActions } from '@features/generation/stores/generationSessionStore';
import { DEFAULT_SESSION_FIELDS } from '@features/generation/stores/generationSessionStore';

import { createBackendStorage } from '../lib/backendStorage';
import { debugFlags } from '../lib/debugFlags';
import { manuallyRehydrateStore, exposeStoreForDebugging } from '../lib/zustandPersistWorkaround';

export type ControlModule = 'quickGenerate' | 'presets' | 'providers' | 'panels' | 'none';
export type DockPosition = 'bottom' | 'left' | 'right' | 'top' | 'floating';
export type LayoutBehavior = 'overlay' | 'push';

export type FusionAssetType = 'character' | 'background' | 'image' | 'video';
export type AssetSourceType = 'url' | 'asset' | 'paused_frame';

export type TimelineAsset = {
  id: string;
  type: 'image' | 'video';

  // Source can be URL, existing asset, or paused frame
  sourceType: AssetSourceType;
  url?: string;                    // When sourceType === 'url'
  assetId?: number;                // When sourceType === 'asset' or 'paused_frame'
  pauseTimestamp?: number;         // When sourceType === 'paused_frame'
  frameNumber?: number;            // Optional frame number for paused frames

  prompt?: string;
  duration?: number;
  thumbnail?: string;
  name?: string;
  fusionType?: FusionAssetType;    // For fusion operations
};

/**
 * ControlCenterState extends GenerationSessionFields to share the core generation
 * session state with GenerationSessionStore. This enables unified access via
 * useGenerationScopeStores() without unsafe type casts.
 */
export interface ControlCenterState extends GenerationSessionFields {
  // UI state specific to ControlCenter
  dockPosition: DockPosition; // where the dock is positioned
  layoutBehavior: LayoutBehavior; // 'overlay' (float over content) or 'push' (resize content)
  conformToOtherPanels: boolean; // if true, adjusts layout when other panels (like Media Viewer) are open
  open: boolean;            // whether dock is expanded
  pinned: boolean;          // if true, stays open
  height: number;           // height/width in px when expanded (used for vertical/horizontal sizing)
  floatingPosition: { x: number; y: number }; // position when floating
  floatingSize: { width: number; height: number }; // size when floating
  activeModule: ControlModule;
  enabledModules: Record<string, boolean>; // module preferences
  assets: TimelineAsset[];  // assets from operator popup
  panelLayoutResetTrigger: number; // timestamp to trigger panel layout resets in modules
  // Note: operationType, prompt, providerId, presetId, presetParams, generating
  // are inherited from GenerationSessionFields
}

/**
 * ControlCenterActions extends GenerationSessionActions to share the core generation
 * session actions. Additional UI-specific actions are defined here.
 */
export interface ControlCenterActions extends GenerationSessionActions {
  // UI actions specific to ControlCenter
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
  setAssets: (assets: TimelineAsset[]) => void;
  triggerPanelLayoutReset: () => void;
  // Note: setOperationType, setPrompt, setProvider, setPreset, setPresetParams,
  // setGenerating, reset are inherited from GenerationSessionActions
}

const STORAGE_KEY = 'control_center_v1';

export const useControlCenterStore = create<ControlCenterState & ControlCenterActions>()(
  persist(
    (set, get) => {
      debugFlags.log('stores', '[ControlCenterStore] Creating store with initial state');
      return {
        // Spread shared generation session defaults
        ...DEFAULT_SESSION_FIELDS,
        // UI-specific defaults
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
        assets: [],
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

          // Adjust default size based on position (increased defaults)
          const isVertical = position === 'left' || position === 'right';
          const newHeight = isVertical ? 450 : 300; // Increased from 320/180

          // When switching positions, keep panel open for better UX
          const updates: any = { dockPosition: position, height: newHeight };

          // Keep panel open when:
          // 1. Switching to floating mode
          // 2. Switching from floating to docked (transitioning back)
          if (position === 'floating' || wasFloating) {
            updates.open = true;
            // When switching from floating to docked, also pin it so it stays visible
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
          const min = isVertical ? 300 : 200; // Increased minimums
          const max = isVertical ? 700 : 500; // Increased maximums
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
        setOperationType: (op) => {
          if (get().operationType === op) return;
          set({ operationType: op });
        },
        setPrompt: (value) => {
          if (get().prompt === value) return;
          set({ prompt: value });
        },
        setProvider: (id) => {
          if (get().providerId === id) return;
          set({ providerId: id });
        },
        setPreset: (id) => {
          if (get().presetId === id) return;
          set({ presetId: id });
        },
        setPresetParams: (params) => set({ presetParams: params }),
        setAssets: (assets) => set({ assets }),
        setGenerating: (v) => {
          if (get().generating === v) return;
          set({ generating: v });
        },
        triggerPanelLayoutReset: () => set({ panelLayoutResetTrigger: Date.now() }),
        reset: () => set({
          // Spread shared generation session defaults
          ...DEFAULT_SESSION_FIELDS,
          // UI-specific defaults
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
          assets: [],
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
        operationType: s.operationType,
        prompt: s.prompt,
        providerId: s.providerId,
        presetId: s.presetId,
        presetParams: s.presetParams,
        assets: s.assets,
      }),
      version: 8,
      migrate: (persistedState: any, version: number) => {
        const migrated = { ...persistedState };

        // Migrate from version 4 to 5: add floating position/size defaults
        if (version < 5) {
          migrated.floatingPosition = migrated.floatingPosition || { x: window.innerWidth / 2 - 300, y: window.innerHeight / 2 - 250 };
          migrated.floatingSize = migrated.floatingSize || { width: 600, height: 500 };
          // Ensure floating mode is always visible on load
          if (migrated.dockPosition === 'floating') {
            migrated.open = true;
          }
        }

        // Migrate from version 5 to 6: add enabledModules and increase defaults
        if (version < 6) {
          migrated.enabledModules = migrated.enabledModules || {};
          // Increase default heights
          if (migrated.height === 180) {
            migrated.height = 300;
          } else if (migrated.height === 320) {
            migrated.height = 450;
          }
          // Increase floating size
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
                prompt: state.prompt?.substring(0, 50) + (state.prompt?.length > 50 ? '...' : ''),
                floatingPosition: state.floatingPosition,
                floatingSize: state.floatingSize,
              });

              // After rehydration, ensure floating mode is visible
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

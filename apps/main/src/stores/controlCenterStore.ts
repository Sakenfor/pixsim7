import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createBackendStorage } from '../lib/backendStorage';
import { manuallyRehydrateStore, exposeStoreForDebugging } from '../lib/zustandPersistWorkaround';

export type ControlModule = 'quickGenerate' | 'presets' | 'providers' | 'panels' | 'none';
export type ControlCenterMode = 'dock' | 'cubes';
export type DockPosition = 'bottom' | 'left' | 'right' | 'top' | 'floating';

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

export interface ControlCenterState {
  mode: ControlCenterMode;  // 'dock' or 'cubes' mode
  dockPosition: DockPosition; // where the dock is positioned
  open: boolean;            // whether dock is expanded
  pinned: boolean;          // if true, stays open
  height: number;           // height/width in px when expanded (used for vertical/horizontal sizing)
  floatingPosition: { x: number; y: number }; // position when floating
  floatingSize: { width: number; height: number }; // size when floating
  activeModule: ControlModule;
  enabledModules: Record<string, boolean>; // module preferences
  operationType: 'text_to_video' | 'image_to_video' | 'video_extend' | 'video_transition' | 'fusion';
  prompt: string;
  recentPrompts: string[];
  providerId?: string;      // selected provider
  presetId?: string;        // selected preset
  presetParams: Record<string, any>; // resolved params from selected preset
  assets: TimelineAsset[];  // assets from operator popup
  generating: boolean;
}

export interface ControlCenterActions {
  setMode: (mode: ControlCenterMode) => void;
  toggleMode: () => void;
  setDockPosition: (position: DockPosition) => void;
  toggleOpen: () => void;
  setOpen: (v: boolean) => void;
  setPinned: (v: boolean) => void;
  setHeight: (px: number) => void;
  setFloatingPosition: (x: number, y: number) => void;
  setFloatingSize: (width: number, height: number) => void;
  setActiveModule: (m: ControlModule) => void;
  setModuleEnabled: (moduleId: string, enabled: boolean) => void;
  setOperationType: (op: ControlCenterState['operationType']) => void;
  setPrompt: (value: string) => void;
  pushPrompt: (p: string) => void;
  setProvider: (id?: string) => void;
  setPreset: (id?: string) => void;
  setPresetParams: (params: Record<string, any>) => void;
  setAssets: (assets: TimelineAsset[]) => void;
  setGenerating: (v: boolean) => void;
  reset: () => void;
}

const STORAGE_KEY = 'control_center_v1';

export const useControlCenterStore = create<ControlCenterState & ControlCenterActions>()(
  persist(
    (set, get) => {
      console.log('[ControlCenterStore] Creating store with initial state');
      return {
        mode: 'dock',
        dockPosition: 'bottom',
        open: false,
        pinned: false,
        height: 300, // Increased from 180px
        floatingPosition: { x: window.innerWidth / 2 - 300, y: window.innerHeight / 2 - 250 },
        floatingSize: { width: 700, height: 600 }, // Increased from 600x500
        activeModule: 'quickGenerate',
        enabledModules: {}, // Empty = all enabled by default
        operationType: 'text_to_video',
        prompt: '',
        recentPrompts: [],
        providerId: undefined,
        presetId: undefined,
        presetParams: {},
        assets: [],
        generating: false,
      setMode: (mode) => {
        if (get().mode === mode) return;
        set({ mode });
      },
      toggleMode: () => set((s) => ({ mode: s.mode === 'dock' ? 'cubes' : 'dock' })),
      setDockPosition: (position) => {
        if (get().dockPosition === position) return;
        // Adjust default size based on position (increased defaults)
        const isVertical = position === 'left' || position === 'right';
        const newHeight = isVertical ? 450 : 300; // Increased from 320/180
        // When switching to floating mode, ensure it's visible
        const updates: any = { dockPosition: position, height: newHeight };
        if (position === 'floating') {
          updates.open = true;
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
      pushPrompt: (p) => set(s => ({ recentPrompts: [p, ...s.recentPrompts.slice(0, 19)] })),
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
      reset: () => set({
        mode: 'dock',
        dockPosition: 'bottom',
        open: false,
        pinned: false,
        height: 300,
        floatingPosition: { x: window.innerWidth / 2 - 300, y: window.innerHeight / 2 - 250 },
        floatingSize: { width: 700, height: 600 },
        activeModule: 'quickGenerate',
        enabledModules: {},
        operationType: 'text_to_video',
        prompt: '',
        recentPrompts: [],
        providerId: undefined,
        presetId: undefined,
        presetParams: {},
        assets: [],
        generating: false,
      })
    };
  },
    {
      name: STORAGE_KEY,
      storage: createBackendStorage('controlCenter'),
      skipHydration: false,
      partialize: (s) => ({
        mode: s.mode,
        dockPosition: s.dockPosition,
        open: s.open,
        pinned: s.pinned,
        height: s.height,
        floatingPosition: s.floatingPosition,
        floatingSize: s.floatingSize,
        activeModule: s.activeModule,
        enabledModules: s.enabledModules,
        operationType: s.operationType,
        prompt: s.prompt,
        recentPrompts: s.recentPrompts,
        providerId: s.providerId,
        presetId: s.presetId,
        presetParams: s.presetParams,
        assets: s.assets,
      }),
      version: 6,
      migrate: (persistedState: any, version: number) => {
        let migrated = { ...persistedState };

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

        return migrated;
      },
      onRehydrateStorage: () => {
        console.log('[ControlCenterStore] onRehydrateStorage outer function called');
        return (state, error) => {
          console.log('[ControlCenterStore] onRehydrateStorage INNER callback called!', { state: !!state, error: !!error });

          try {
            if (error) {
              console.error('[ControlCenterStore] Rehydration error:', error);
              return;
            }

            if (state) {
              console.log('[ControlCenterStore] ✅ Rehydration complete! State received:', {
                mode: state.mode,
                dockPosition: state.dockPosition,
                open: state.open,
                pinned: state.pinned,
                prompt: state.prompt?.substring(0, 50) + (state.prompt?.length > 50 ? '...' : ''),
                floatingPosition: state.floatingPosition,
                floatingSize: state.floatingSize,
              });

              // After rehydration, ensure floating mode is visible
              if (state.dockPosition === 'floating' && !state.open) {
                console.log('[ControlCenterStore] Setting floating mode to open');
                state.setOpen(true);
              }
            } else {
              console.warn('[ControlCenterStore] ⚠️ Rehydration returned no state (state is null/undefined)');
            }
          } catch (e) {
            console.error('[ControlCenterStore] ❌ Error in rehydration callback:', e);
          }
        };
      },
    }
  )
);

// Force hydration on module load
console.log('[ControlCenterStore] Module loaded, checking for persisted state...');

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

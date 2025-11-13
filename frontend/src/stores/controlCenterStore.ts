import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ControlModule = 'quickGenerate' | 'shortcuts' | 'presets' | 'providers' | 'panels' | 'none';

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
  open: boolean;            // whether dock is expanded
  pinned: boolean;          // if true, stays open
  height: number;           // height in px when expanded
  activeModule: ControlModule;
  operationType: 'text_to_video' | 'image_to_video' | 'video_extend' | 'video_transition' | 'fusion';
  recentPrompts: string[];
  providerId?: string;      // selected provider
  presetId?: string;        // selected preset
  presetParams: Record<string, any>; // resolved params from selected preset
  assets: TimelineAsset[];  // assets from operator popup
  generating: boolean;
}

export interface ControlCenterActions {
  toggleOpen: () => void;
  setOpen: (v: boolean) => void;
  setPinned: (v: boolean) => void;
  setHeight: (px: number) => void;
  setActiveModule: (m: ControlModule) => void;
  setOperationType: (op: ControlCenterState['operationType']) => void;
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
    (set, get) => ({
      open: false,
      pinned: false,
      height: 220,
      activeModule: 'quickGenerate',
      operationType: 'text_to_video',
      recentPrompts: [],
      providerId: undefined,
      presetId: undefined,
      presetParams: {},
      assets: [],
      generating: false,
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
        const next = Math.max(140, Math.min(480, px));
        if (get().height === next) return;
        set({ height: next });
      },
      setActiveModule: (m) => {
        if (get().activeModule === m) return;
        set({ activeModule: m });
      },
      setOperationType: (op) => {
        if (get().operationType === op) return;
        set({ operationType: op });
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
      reset: () => set({ open: false, pinned: false, height: 220, activeModule: 'quickGenerate', operationType: 'text_to_video', recentPrompts: [], providerId: undefined, presetId: undefined, presetParams: {}, assets: [], generating: false })
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({ open: s.open, pinned: s.pinned, height: s.height, activeModule: s.activeModule, operationType: s.operationType, recentPrompts: s.recentPrompts, providerId: s.providerId, presetId: s.presetId, presetParams: s.presetParams, assets: s.assets }),
      version: 2,
    }
  )
);

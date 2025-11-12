import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ControlModule = 'quickGenerate' | 'shortcuts' | 'presets' | 'none';

export interface ControlCenterState {
  open: boolean;            // whether dock is expanded
  pinned: boolean;          // if true, stays open
  height: number;           // height in px when expanded
  activeModule: ControlModule;
  recentPrompts: string[];
  providerId?: string;      // selected provider
  presetId?: string;        // selected preset
  generating: boolean;
}

export interface ControlCenterActions {
  toggleOpen: () => void;
  setOpen: (v: boolean) => void;
  setPinned: (v: boolean) => void;
  setHeight: (px: number) => void;
  setActiveModule: (m: ControlModule) => void;
  pushPrompt: (p: string) => void;
  setProvider: (id?: string) => void;
  setPreset: (id?: string) => void;
  setGenerating: (v: boolean) => void;
  reset: () => void;
}

const STORAGE_KEY = 'control_center_v1';

export const useControlCenterStore = create<ControlCenterState & ControlCenterActions>()(
  persist(
    (set) => ({
      open: false,
      pinned: false,
      height: 220,
      activeModule: 'quickGenerate',
      recentPrompts: [],
      providerId: undefined,
      presetId: undefined,
      generating: false,
      toggleOpen: () => set(s => ({ open: !s.open })),
      setOpen: (v) => set({ open: v }),
      setPinned: (v) => set({ pinned: v }),
      setHeight: (px) => set({ height: Math.max(140, Math.min(480, px)) }),
      setActiveModule: (m) => set({ activeModule: m }),
      pushPrompt: (p) => set(s => ({ recentPrompts: [p, ...s.recentPrompts.slice(0, 19)] })),
      setProvider: (id) => set({ providerId: id }),
      setPreset: (id) => set({ presetId: id }),
      setGenerating: (v) => set({ generating: v }),
      reset: () => set({ open: false, pinned: false, height: 220, activeModule: 'quickGenerate', recentPrompts: [], providerId: undefined, presetId: undefined, generating: false })
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({ open: s.open, pinned: s.pinned, height: s.height, activeModule: s.activeModule, recentPrompts: s.recentPrompts, providerId: s.providerId, presetId: s.presetId }),
      version: 1,
    }
  )
);

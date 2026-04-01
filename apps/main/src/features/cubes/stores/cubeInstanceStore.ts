/**
 * Cube Instance Store
 *
 * Persisted store tracking cube instance metadata (label, icon, accent color, preset).
 * Each instance corresponds to a MinimizedPanelStack widget rendered on screen.
 * Auto-seeds the 'default' instance on first use.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { createBackendStorage } from '@lib/backendStorage';

// ── Presets ──

export type CubePreset = 'panel-hub' | 'asset-cube' | 'tool-cube';

export interface CubePresetDef {
  label: string;
  icon: string;
  defaultColor: string;
  description: string;
}

export const CUBE_PRESETS: Record<CubePreset, CubePresetDef> = {
  'panel-hub':  { label: 'Panel Hub',  icon: 'layoutGrid', defaultColor: 'cyan',    description: 'Minimized floating panels' },
  'asset-cube': { label: 'Asset Cube', icon: 'image',      defaultColor: 'amber',   description: 'Pinned assets' },
  'tool-cube':  { label: 'Tool Cube',  icon: 'wrench',     defaultColor: 'emerald',  description: 'Quick tool access' },
};

// ── Instance metadata ──

export interface CubeInstanceMeta {
  id: string;
  label: string;
  icon: string;
  accentColor: string;
  preset: CubePreset;
}

// ── Store ──

interface CubeInstanceStoreState {
  instances: Record<string, CubeInstanceMeta>;
  createInstance: (label: string, preset: CubePreset, accentColor?: string) => string;
  removeInstance: (id: string) => void;
  updateInstance: (id: string, updates: Partial<Omit<CubeInstanceMeta, 'id'>>) => void;
}

const DEFAULT_INSTANCE: CubeInstanceMeta = {
  id: 'default',
  label: 'Panel Hub',
  icon: 'layoutGrid',
  accentColor: 'cyan',
  preset: 'panel-hub',
};

let instanceCounter = 0;

const STORAGE_KEY = 'cubeInstances';

export const useCubeInstanceStore = create<CubeInstanceStoreState>()(
  persist(
    (set) => ({
      instances: { default: DEFAULT_INSTANCE },

      createInstance: (label, preset, accentColor?) => {
        const presetDef = CUBE_PRESETS[preset];
        const id = `cube-inst-${Date.now()}-${++instanceCounter}`;
        const meta: CubeInstanceMeta = {
          id,
          label: label || presetDef.label,
          icon: presetDef.icon,
          accentColor: accentColor ?? presetDef.defaultColor,
          preset,
        };
        set((state) => ({
          instances: { ...state.instances, [id]: meta },
        }));
        return id;
      },

      removeInstance: (id) => {
        if (id === 'default') return; // Cannot remove default
        set((state) => {
          const rest = { ...state.instances };
          delete rest[id];
          return { instances: rest };
        });
      },

      updateInstance: (id, updates) => {
        set((state) => {
          const existing = state.instances[id];
          if (!existing) return state;
          return {
            instances: {
              ...state.instances,
              [id]: { ...existing, ...updates },
            },
          };
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => createBackendStorage(STORAGE_KEY)),
      // Ensure default instance always exists after rehydration
      onRehydrateStorage: () => (state) => {
        if (state && !state.instances.default) {
          state.instances = { default: DEFAULT_INSTANCE, ...state.instances };
        }
      },
    },
  ),
);

/** Derive ordered instances from the instances map. Default always first. */
export function selectOrderedInstances(instances: Record<string, CubeInstanceMeta>): CubeInstanceMeta[] {
  const result: CubeInstanceMeta[] = [];
  if (instances.default) result.push(instances.default);
  for (const inst of Object.values(instances)) {
    if (inst.id !== 'default') result.push(inst);
  }
  return result;
}

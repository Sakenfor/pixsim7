/**
 * Tool Configuration Store
 *
 * Manages runtime tool parameter overrides from the console.
 * Allows adjusting tool physics, visuals, feedback, and constraints
 * for testing, development, or "cheat" purposes.
 */

import { create } from 'zustand';
import type { InteractiveTool } from '@pixsim/scene-gizmos';

/** Deep partial type for nested overrides */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type ToolOverrides = DeepPartial<Omit<InteractiveTool, 'id' | 'type'>>;

export interface ToolPreset {
  id: string;
  name: string;
  description: string;
  overrides: ToolOverrides;
}

interface ToolConfigState {
  /** Per-tool overrides keyed by tool ID */
  overrides: Record<string, ToolOverrides>;

  /** Built-in presets for quick configuration */
  presets: ToolPreset[];

  /** Active tool being configured (for UI focus) */
  activeToolId: string | null;

  /** History of changes for undo */
  history: Array<{ toolId: string; path: string; oldValue: unknown; newValue: unknown }>;
}

interface ToolConfigActions {
  /** Set a single parameter override using dot notation path */
  setParameter: (toolId: string, path: string, value: unknown) => void;

  /** Set multiple overrides at once */
  setOverrides: (toolId: string, overrides: ToolOverrides) => void;

  /** Apply a preset to a tool */
  applyPreset: (toolId: string, presetId: string) => void;

  /** Reset a tool to its default (clear all overrides) */
  resetTool: (toolId: string) => void;

  /** Reset all tools */
  resetAll: () => void;

  /** Get merged overrides for a tool */
  getOverrides: (toolId: string) => ToolOverrides | undefined;

  /** Set active tool for UI */
  setActiveTool: (toolId: string | null) => void;

  /** Undo last change */
  undo: () => void;
}

/** Helper to set a nested value by dot notation path */
function setByPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const result = { ...obj };
  const parts = path.split('.');
  let current: Record<string, unknown> = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    current[key] = current[key] ? { ...(current[key] as Record<string, unknown>) } : {};
    current = current[key] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
  return result;
}

/** Helper to get a nested value by dot notation path */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/** Built-in presets */
const defaultPresets: ToolPreset[] = [
  {
    id: 'gentle',
    name: 'Gentle',
    description: 'Soft, slow interactions',
    overrides: {
      physics: { pressure: 0.2, speed: 0.3 },
    },
  },
  {
    id: 'intense',
    name: 'Intense',
    description: 'Strong, fast interactions',
    overrides: {
      physics: { pressure: 0.9, speed: 0.8, vibration: 0.7 },
    },
  },
  {
    id: 'no-cooldown',
    name: 'No Cooldown',
    description: 'Remove all cooldown restrictions',
    overrides: {
      constraints: { cooldown: 0 },
    },
  },
  {
    id: 'max-particles',
    name: 'Max Particles',
    description: 'Maximum particle effects',
    overrides: {
      visual: {
        glow: true,
        trail: true,
        particles: { density: 1, lifetime: 2000 },
      },
    },
  },
  {
    id: 'silent',
    name: 'Silent',
    description: 'No audio feedback',
    overrides: {
      feedback: { audio: { volume: 0 } },
    },
  },
  {
    id: 'cold',
    name: 'Cold',
    description: 'Temperature set to cold',
    overrides: {
      physics: { temperature: 0 },
    },
  },
  {
    id: 'hot',
    name: 'Hot',
    description: 'Temperature set to hot',
    overrides: {
      physics: { temperature: 1 },
    },
  },
];

export const useToolConfigStore = create<ToolConfigState & ToolConfigActions>((set, get) => ({
  overrides: {},
  presets: defaultPresets,
  activeToolId: null,
  history: [],

  setParameter: (toolId, path, value) => {
    const current = get().overrides[toolId] || {};
    const oldValue = getByPath(current as Record<string, unknown>, path);
    const newOverrides = setByPath(current as Record<string, unknown>, path, value) as ToolOverrides;

    set((state) => ({
      overrides: {
        ...state.overrides,
        [toolId]: newOverrides,
      },
      history: [
        ...state.history.slice(-49), // Keep last 50 changes
        { toolId, path, oldValue, newValue: value },
      ],
    }));
  },

  setOverrides: (toolId, overrides) => {
    set((state) => ({
      overrides: {
        ...state.overrides,
        [toolId]: {
          ...state.overrides[toolId],
          ...overrides,
        },
      },
    }));
  },

  applyPreset: (toolId, presetId) => {
    const preset = get().presets.find((p) => p.id === presetId);
    if (!preset) {
      console.warn(`[ToolConfig] Unknown preset: ${presetId}`);
      return;
    }

    set((state) => ({
      overrides: {
        ...state.overrides,
        [toolId]: {
          ...state.overrides[toolId],
          ...preset.overrides,
        },
      },
    }));
  },

  resetTool: (toolId) => {
    set((state) => {
      const { [toolId]: _removed, ...rest } = state.overrides;
      return { overrides: rest };
    });
  },

  resetAll: () => {
    set({ overrides: {}, history: [] });
  },

  getOverrides: (toolId) => {
    return get().overrides[toolId];
  },

  setActiveTool: (toolId) => {
    set({ activeToolId: toolId });
  },

  undo: () => {
    const { history } = get();
    if (history.length === 0) return;

    const last = history[history.length - 1];
    const current = get().overrides[last.toolId] || {};
    const newOverrides = setByPath(
      current as Record<string, unknown>,
      last.path,
      last.oldValue
    ) as ToolOverrides;

    set((state) => ({
      overrides: {
        ...state.overrides,
        [last.toolId]: newOverrides,
      },
      history: state.history.slice(0, -1),
    }));
  },
}));

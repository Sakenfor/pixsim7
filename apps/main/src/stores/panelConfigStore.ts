import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createBackendStorage } from '../lib/backendStorage';
import type { PanelId } from './workspaceStore';

/**
 * Panel Configuration Store
 *
 * Manages panel-specific configurations, settings, and metadata.
 * Part of Task 50 Phase 50.2 - Panel Configuration UI
 */

export interface PanelConfig {
  id: PanelId;
  enabled: boolean;
  settings: Record<string, any>; // Panel-specific settings
  category?: 'core' | 'development' | 'game' | 'tools' | 'custom';
  tags?: string[];
  description?: string;
  icon?: string;
}

export interface PanelInstance {
  panelId: PanelId;
  instanceId: string; // Unique per instance
  state: Record<string, any>; // Instance-specific state
  position: 'docked' | 'floating';
  config: PanelConfig;
}

export interface PanelConfigState {
  // Panel configurations
  panelConfigs: Record<PanelId, PanelConfig>;

  // Active panel instances (for supporting multiple instances of same panel)
  activeInstances: PanelInstance[];

  // Schema version for migrations
  schemaVersion: number;
}

export interface PanelConfigActions {
  // Panel configuration
  setPanelConfig: (panelId: PanelId, config: Partial<PanelConfig>) => void;
  getPanelConfig: (panelId: PanelId) => PanelConfig | undefined;
  togglePanelEnabled: (panelId: PanelId) => void;

  // Panel settings
  updatePanelSettings: (panelId: PanelId, settings: Record<string, any>) => void;
  resetPanelSettings: (panelId: PanelId) => void;

  // Panel instances
  createPanelInstance: (panelId: PanelId, position: 'docked' | 'floating') => string;
  removePanelInstance: (instanceId: string) => void;
  updatePanelInstanceState: (instanceId: string, state: Record<string, any>) => void;

  // Bulk operations
  getEnabledPanels: () => PanelId[];
  getPanelsByCategory: (category: string) => PanelConfig[];
  searchPanels: (query: string) => PanelConfig[];

  // Reset
  reset: () => void;
}

// Default panel configurations
const defaultPanelConfigs: Record<PanelId, PanelConfig> = {
  gallery: {
    id: 'gallery',
    enabled: true,
    settings: {},
    category: 'core',
    tags: ['assets', 'media'],
    description: 'Browse and manage project assets',
    icon: '🖼️',
  },
  scene: {
    id: 'scene',
    enabled: true,
    settings: {},
    category: 'core',
    tags: ['scene', 'builder'],
    description: 'Build and edit scenes',
    icon: '🎬',
  },
  graph: {
    id: 'graph',
    enabled: true,
    settings: {
      // Default graph editor surface for the Graph panel.
      // Can be changed via advanced panel settings.
      graphEditorId: 'scene-graph-v2',
    },
    category: 'core',
    tags: ['graph', 'nodes'],
    description: 'Visual node-based editor',
    icon: '🔀',
  },
  inspector: {
    id: 'inspector',
    enabled: true,
    settings: {},
    category: 'core',
    tags: ['inspector', 'properties'],
    description: 'Inspect and edit node properties',
    icon: '🔍',
  },
  health: {
    id: 'health',
    enabled: true,
    settings: { compactMode: false },
    category: 'development',
    tags: ['health', 'monitoring', 'validation'],
    description: 'System health and validation',
    icon: '❤️',
  },
  game: {
    id: 'game',
    enabled: true,
    settings: {},
    category: 'game',
    tags: ['game', 'preview'],
    description: 'Game preview and testing',
    icon: '🎮',
  },
  providers: {
    id: 'providers',
    enabled: true,
    settings: {},
    category: 'development',
    tags: ['providers', 'api'],
    description: 'API provider settings',
    icon: '🔌',
  },
  settings: {
    id: 'settings',
    enabled: true,
    settings: {},
    category: 'core',
    tags: ['settings', 'configuration'],
    description: 'Application settings',
    icon: '⚙️',
  },
  'gizmo-lab': {
    id: 'gizmo-lab',
    enabled: true,
    settings: {},
    category: 'tools',
    tags: ['gizmos', 'lab', 'experimental'],
    description: 'Gizmo testing laboratory',
    icon: '🧪',
  },
  'npc-brain-lab': {
    id: 'npc-brain-lab',
    enabled: true,
    settings: {},
    category: 'tools',
    tags: ['npc', 'ai', 'brain'],
    description: 'NPC behavior testing',
    icon: '🧠',
  },
  'game-theming': {
    id: 'game-theming',
    enabled: true,
    settings: {},
    category: 'game',
    tags: ['theming', 'customization'],
    description: 'Game theme customization',
    icon: '🎨',
  },
  'scene-management': {
    id: 'scene-management',
    enabled: true,
    settings: {},
    category: 'core',
    tags: ['scene', 'management', 'workflow'],
    description: 'Unified scene workflow management',
    icon: '📚',
  },
};

const STORAGE_KEY = 'panel_config_v1';

export const usePanelConfigStore = create<PanelConfigState & PanelConfigActions>()(
  persist(
    (set, get) => ({
      // Initial state
      panelConfigs: defaultPanelConfigs,
      activeInstances: [],
      schemaVersion: 1,

      // Panel configuration
      setPanelConfig: (panelId, config) => {
        set((state) => ({
          panelConfigs: {
            ...state.panelConfigs,
            [panelId]: {
              ...state.panelConfigs[panelId],
              ...config,
            },
          },
        }));
      },

      getPanelConfig: (panelId) => {
        return get().panelConfigs[panelId];
      },

      togglePanelEnabled: (panelId) => {
        const config = get().panelConfigs[panelId];
        if (config) {
          get().setPanelConfig(panelId, { enabled: !config.enabled });
        }
      },

      // Panel settings
      updatePanelSettings: (panelId, settings) => {
        const config = get().panelConfigs[panelId];
        if (config) {
          get().setPanelConfig(panelId, {
            settings: {
              ...config.settings,
              ...settings,
            },
          });
        }
      },

      resetPanelSettings: (panelId) => {
        const defaultConfig = defaultPanelConfigs[panelId];
        if (defaultConfig) {
          get().setPanelConfig(panelId, {
            settings: defaultConfig.settings,
          });
        }
      },

      // Panel instances
      createPanelInstance: (panelId, position) => {
        const instanceId = `${panelId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const config = get().panelConfigs[panelId];

        if (!config) {
          console.warn(`Cannot create instance: Panel config not found for ${panelId}`);
          return instanceId;
        }

        const newInstance: PanelInstance = {
          panelId,
          instanceId,
          state: {},
          position,
          config,
        };

        set((state) => ({
          activeInstances: [...state.activeInstances, newInstance],
        }));

        return instanceId;
      },

      removePanelInstance: (instanceId) => {
        set((state) => ({
          activeInstances: state.activeInstances.filter((i) => i.instanceId !== instanceId),
        }));
      },

      updatePanelInstanceState: (instanceId, state) => {
        set((s) => ({
          activeInstances: s.activeInstances.map((instance) =>
            instance.instanceId === instanceId
              ? { ...instance, state: { ...instance.state, ...state } }
              : instance
          ),
        }));
      },

      // Bulk operations
      getEnabledPanels: () => {
        const configs = get().panelConfigs;
        return Object.values(configs)
          .filter((config) => config.enabled)
          .map((config) => config.id);
      },

      getPanelsByCategory: (category) => {
        const configs = get().panelConfigs;
        return Object.values(configs).filter((config) => config.category === category);
      },

      searchPanels: (query) => {
        const configs = get().panelConfigs;
        const lowerQuery = query.toLowerCase();

        return Object.values(configs).filter((config) => {
          const matchesId = config.id.toLowerCase().includes(lowerQuery);
          const matchesDescription = config.description?.toLowerCase().includes(lowerQuery);
          const matchesTags = config.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery));

          return matchesId || matchesDescription || matchesTags;
        });
      },

      // Reset
      reset: () => {
        set({
          panelConfigs: defaultPanelConfigs,
          activeInstances: [],
          schemaVersion: 1,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createBackendStorage('panel-config'),
      version: 1,
    }
  )
);

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  createBackendStorage,
  manuallyRehydrateStore,
  exposeStoreForDebugging,
  debugFlags,
} from "@lib/utils";

import type { PanelId } from "@features/workspace";

import type { MediaCardBadgeConfig } from "@/components/media/MediaCard";
import { pluginCatalog } from "@/lib/plugins/pluginSystem";

import type { PanelCategory } from "../lib/panelConstants";

/**
 * Panel Configuration Store
 *
 * Manages panel-specific configurations, settings, and metadata.
 * Part of Task 50 Phase 50.2 - Panel Configuration UI
 */

/**
 * Registry-level overrides for panel behavior
 * (consolidated from panelRegistryOverridesStore)
 */
export interface PanelRegistryOverride {
  supportsMultipleInstances?: boolean;
}

export interface PanelConfig {
  id: PanelId;
  enabled: boolean;
  settings: Record<string, unknown>; // Panel-specific settings
  category?: PanelCategory;
  tags?: string[];
  description?: string;
  icon?: string;
  registryOverride?: PanelRegistryOverride;
}

export interface PanelInstance {
  panelId: PanelId;
  instanceId: string; // Unique per instance
  state: Record<string, unknown>; // Instance-specific state
  position: "docked" | "floating";
  config: PanelConfig;
}

export interface PanelConfigState {
  // Panel configurations
  panelConfigs: Partial<Record<PanelId, PanelConfig>>;

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
  togglePanel: (panelId: PanelId) => void;

  // Panel settings
  updatePanelSettings: (
    panelId: PanelId,
    settings: Record<string, any>,
  ) => void;
  resetPanelSettings: (panelId: PanelId) => void;

  // Panel instances
  createPanelInstance: (
    panelId: PanelId,
    position: "docked" | "floating",
  ) => string;
  removePanelInstance: (instanceId: string) => void;
  updatePanelInstanceState: (
    instanceId: string,
    state: Record<string, any>,
  ) => void;

  // Bulk operations
  getEnabledPanels: () => PanelId[];
  getPanelsByCategory: (category: string) => PanelConfig[];
  searchPanels: (query: string) => PanelConfig[];

  // Registry overrides (consolidated from panelRegistryOverridesStore)
  setRegistryOverride: (panelId: PanelId, override: PanelRegistryOverride) => void;
  clearRegistryOverride: (panelId: PanelId) => void;
  getRegistryOverride: (panelId: PanelId) => PanelRegistryOverride | undefined;

  // Reset
  reset: () => void;
}

// Gallery panel badge configuration
export interface GalleryPanelSettings {
  overlayPresetId?: string; // e.g. 'media-card-default', 'media-card-minimal', etc.
  badgeConfig?: Partial<MediaCardBadgeConfig>;
  [key: string]: unknown;
}

const defaultGalleryBadgeConfig: Partial<MediaCardBadgeConfig> = {
  showPrimaryIcon: true,
  showStatusIcon: true,
  showStatusTextOnHover: true,
  showTagsInOverlay: false,
  showFooterProvider: false,
  showFooterDate: true,
};

// Default panel configurations
const defaultPanelConfigs: Partial<Record<PanelId, PanelConfig>> = {
  gallery: {
    id: "gallery",
    enabled: true,
    settings: {
      overlayPresetId: "media-card-default",
      badgeConfig: defaultGalleryBadgeConfig,
    } as GalleryPanelSettings,
    category: "workspace",
    tags: ["assets", "media"],
    description: "Browse and manage project assets",
    icon: "🖼️",
  },
  scene: {
    id: "scene",
    enabled: true,
    settings: {},
    category: "scene",
    tags: ["scene", "builder"],
    description: "Build and edit scenes",
    icon: "🎬",
  },
  graph: {
    id: "graph",
    enabled: true,
    settings: {
      // Default graph editor surface for the Graph panel.
      // Can be changed via advanced panel settings.
      graphEditorId: "scene-graph-v2",
    },
    category: "workspace",
    tags: ["graph", "nodes"],
    description: "Visual node-based editor",
    icon: "🔀",
  },
  inspector: {
    id: "inspector",
    enabled: true,
    settings: {},
    category: "workspace",
    tags: ["inspector", "properties"],
    description: "Inspect and edit node properties",
    icon: "🔍",
  },
  health: {
    id: "health",
    enabled: true,
    settings: { compactMode: false },
    category: "system",
    tags: ["health", "monitoring", "validation"],
    description: "System health and validation",
    icon: "❤️",
  },
  game: {
    id: "game",
    enabled: true,
    settings: {},
    category: "game",
    tags: ["game", "preview"],
    description: "Game preview and testing",
    icon: "🎮",
  },
  providers: {
    id: "providers",
    enabled: true,
    settings: {},
    category: "system",
    tags: ["providers", "api"],
    description: "API provider settings",
    icon: "🔌",
  },
  settings: {
    id: "settings",
    enabled: true,
    settings: {},
    category: "utilities",
    tags: ["settings", "configuration"],
    description: "Application settings",
    icon: "⚙️",
  },
  "gizmo-lab": {
    id: "gizmo-lab",
    enabled: true,
    settings: {},
    category: "tools",
    tags: ["gizmos", "lab", "experimental"],
    description: "Gizmo testing laboratory",
    icon: "🧪",
  },
  "npc-brain-lab": {
    id: "npc-brain-lab",
    enabled: true,
    settings: {},
    category: "tools",
    tags: ["npc", "ai", "brain"],
    description: "NPC behavior testing",
    icon: "🧠",
  },
  "game-theming": {
    id: "game-theming",
    enabled: true,
    settings: {},
    category: "game",
    tags: ["theming", "customization"],
    description: "Game theme customization",
    icon: "🎨",
  },
  "scene-management": {
    id: "scene-management",
    enabled: true,
    settings: {},
    category: "scene",
    tags: ["scene", "management", "workflow"],
    description: "Unified scene workflow management",
    icon: "📚",
  },
  "hud-designer": {
    id: "hud-designer",
    enabled: true,
    settings: {},
    category: "tools",
    tags: ["hud", "designer", "layout", "ui"],
    description: "Design HUD layouts for game worlds",
    icon: "🎨",
  },
};

const STORAGE_KEY = "panel_config_v1";

export const usePanelConfigStore = create<
  PanelConfigState & PanelConfigActions
>()(
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
        // Check if panel is disabled via plugin system
        const pluginMeta = pluginCatalog.get(panelId);
        if (pluginMeta && pluginMeta.activationState === "inactive") {
          console.warn(
            `Cannot enable panel "${panelId}": Panel is disabled at plugin level. Enable it in the Plugin Browser first.`,
          );
          // TODO: Show user-facing notification
          return;
        }

        const config = get().panelConfigs[panelId];
        if (config) {
          get().setPanelConfig(panelId, { enabled: !config.enabled });
        }
      },
      togglePanel: (panelId) => {
        get().togglePanelEnabled(panelId);
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
          console.warn(
            `Cannot create instance: Panel config not found for ${panelId}`,
          );
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
          activeInstances: state.activeInstances.filter(
            (i) => i.instanceId !== instanceId,
          ),
        }));
      },

      updatePanelInstanceState: (instanceId, state) => {
        set((s) => ({
          activeInstances: s.activeInstances.map((instance) =>
            instance.instanceId === instanceId
              ? { ...instance, state: { ...instance.state, ...state } }
              : instance,
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
        return Object.values(configs).filter(
          (config) => config.category === category,
        );
      },

      searchPanels: (query) => {
        const configs = get().panelConfigs;
        const lowerQuery = query.toLowerCase();

        return Object.values(configs).filter((config) => {
          const matchesId = config.id.toLowerCase().includes(lowerQuery);
          const matchesDescription = config.description
            ?.toLowerCase()
            .includes(lowerQuery);
          const matchesTags = config.tags?.some((tag) =>
            tag.toLowerCase().includes(lowerQuery),
          );

          return matchesId || matchesDescription || matchesTags;
        });
      },

      // Registry overrides (consolidated from panelRegistryOverridesStore)
      setRegistryOverride: (panelId, override) => {
        const config = get().panelConfigs[panelId];
        if (config) {
          const merged = { ...config.registryOverride, ...override };
          // Prune undefined values
          Object.keys(merged).forEach((key) => {
            if (merged[key as keyof PanelRegistryOverride] === undefined) {
              delete merged[key as keyof PanelRegistryOverride];
            }
          });
          get().setPanelConfig(panelId, {
            registryOverride: Object.keys(merged).length > 0 ? merged : undefined,
          });
        }
      },

      clearRegistryOverride: (panelId) => {
        const config = get().panelConfigs[panelId];
        if (config) {
          get().setPanelConfig(panelId, { registryOverride: undefined });
        }
      },

      getRegistryOverride: (panelId) => {
        return get().panelConfigs[panelId]?.registryOverride;
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
      storage: createJSONStorage(() => createBackendStorage("panel-config")),
      version: 1,
    },
  ),
);

// Manual rehydration workaround for async storage (see zustandPersistWorkaround.ts)
if (typeof window !== "undefined") {
  setTimeout(() => {
    debugFlags.log(
      "rehydration",
      "[PanelConfigStore] Triggering manual rehydration",
    );
    manuallyRehydrateStore(
      usePanelConfigStore,
      "panel-config_local",
      "PanelConfigStore",
    );
    exposeStoreForDebugging(usePanelConfigStore, "PanelConfig");
  }, 50);
}

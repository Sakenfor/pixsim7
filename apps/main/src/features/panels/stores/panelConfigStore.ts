import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  createBackendStorage,
  manuallyRehydrateStore,
  exposeStoreForDebugging,
  debugFlags,
} from "@lib/utils";

import type { MediaCardBadgeConfig } from "@/components/media/MediaCard";
import { panelSelectors } from "@/lib/plugins/catalogSelectors";
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
  id: string;
  enabled: boolean;
  settings: Record<string, unknown>; // Panel-specific settings
  category?: PanelCategory;
  tags?: string[];
  description?: string;
  icon?: string;
  registryOverride?: PanelRegistryOverride;
}

export interface PanelInstance {
  panelId: string;
  instanceId: string; // Unique per instance
  state: Record<string, unknown>; // Instance-specific state
  position: "docked" | "floating";
  config: PanelConfig;
}

export interface PanelConfigState {
  // Panel configurations
  panelConfigs: Partial<Record<string, PanelConfig>>;

  // Active panel instances (for supporting multiple instances of same panel)
  activeInstances: PanelInstance[];

  // Schema version for migrations
  schemaVersion: number;
}

export interface PanelConfigActions {
  // Panel configuration
  setPanelConfig: (panelId: string, config: Partial<PanelConfig>) => void;
  getPanelConfig: (panelId: string) => PanelConfig | undefined;
  togglePanelEnabled: (panelId: string) => void;
  togglePanel: (panelId: string) => void;

  // Panel settings
  updatePanelSettings: (
    panelId: string,
    settings: Record<string, any>,
  ) => void;
  resetPanelSettings: (panelId: string) => void;

  // Panel instances
  createPanelInstance: (
    panelId: string,
    position: "docked" | "floating",
  ) => string;
  removePanelInstance: (instanceId: string) => void;
  updatePanelInstanceState: (
    instanceId: string,
    state: Record<string, any>,
  ) => void;

  // Bulk operations
  getEnabledPanels: () => string[];
  getPanelsByCategory: (category: string) => PanelConfig[];
  searchPanels: (query: string) => PanelConfig[];

  // Registry overrides (consolidated from panelRegistryOverridesStore)
  setRegistryOverride: (panelId: string, override: PanelRegistryOverride) => void;
  clearRegistryOverride: (panelId: string) => void;
  getRegistryOverride: (panelId: string) => PanelRegistryOverride | undefined;

  // Reset
  reset: () => void;
}

// Gallery panel badge configuration
export type GalleryGroupBy = "none" | "source" | "generation" | "prompt" | "sibling";
export type GalleryGroupView = "folders" | "inline" | "panel" | "cluster";
export type GalleryGroupScope = string[];
export type GalleryGroupMode = "single" | "multi";
export type GalleryGroupBySelection = GalleryGroupBy | GalleryGroupBy[];
export type GalleryGroupMultiLayout = "stack" | "parallel";

export type GalleryClusterBy = "prompt" | "generation" | "sibling";

export interface GalleryPanelSettings {
  overlayPresetId?: string; // e.g. 'media-card-default', 'media-card-minimal', etc.
  badgeConfig?: Partial<MediaCardBadgeConfig>;
  groupBy?: GalleryGroupBySelection;
  groupView?: GalleryGroupView;
  groupScope?: GalleryGroupScope;
  groupMode?: GalleryGroupMode;
  groupMultiLayout?: GalleryGroupMultiLayout;
  /** Dimension used for cluster view (default: 'prompt') */
  clusterBy?: GalleryClusterBy;
  [key: string]: unknown;
}

const defaultGalleryBadgeConfig: Partial<MediaCardBadgeConfig> = {
  showStatusIcon: true,
  showTagsInOverlay: false,
  showFooterProvider: false,
  showGenerationBadge: true,
};

// Default panel configurations
const defaultPanelConfigs: Partial<Record<string, PanelConfig>> = {
  gallery: {
    id: "gallery",
    enabled: true,
    settings: {
      overlayPresetId: "media-card-default",
      badgeConfig: defaultGalleryBadgeConfig,
      groupBy: "none",
      groupView: "inline",
      groupScope: [],
      groupMode: "single",
      groupMultiLayout: "stack",
    } as GalleryPanelSettings,
    category: "workspace",
    tags: ["assets", "media"],
    description: "Browse and manage project assets",
    icon: "🖼️",
  },
  project: {
    id: "project",
    enabled: true,
    settings: {},
    category: "workspace",
    tags: ["project", "import", "export", "bundle"],
    description: "Project-level save/load for world bundles",
    icon: "ðŸ’¾",
  },
  scene: {
    id: "scene",
    enabled: true,
    settings: {},
    category: "scene",
    tags: ["scene", "builder", "legacy"],
    description: "Legacy scene entrypoint (opens Scene Management builder tab)",
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
  "prompt-library-inspector": {
    id: "prompt-library-inspector",
    enabled: true,
    settings: {},
    category: "generation",
    tags: ["prompts", "blocks", "templates", "content-packs", "inspector", "library"],
    description: "Inspect content packs, prompt templates, and blocks with package-focused diagnostics",
    icon: "📚",
  },
};

function buildPanelConfigFromRegistry(
  panelId: string,
  existing?: PanelConfig,
): PanelConfig | undefined {
  const panel = panelSelectors.get(panelId);
  if (!panel) return existing;
  return {
    id: panel.id,
    enabled: existing?.enabled ?? true,
    settings: existing?.settings ?? {},
    category: panel.category,
    tags: panel.tags ?? existing?.tags,
    description: panel.description ?? existing?.description,
    icon: typeof panel.icon === "string" ? panel.icon : existing?.icon,
    registryOverride: existing?.registryOverride,
  };
}

function getRegistryBackedPanelConfigs(
  panelConfigs: Partial<Record<string, PanelConfig>>,
): PanelConfig[] {
  const mergedById = new Map<string, PanelConfig>();
  for (const panel of panelSelectors.getPublicPanels()) {
    const merged = buildPanelConfigFromRegistry(panel.id, panelConfigs[panel.id]);
    if (merged) mergedById.set(panel.id, merged);
  }
  for (const config of Object.values(panelConfigs)) {
    if (!config) continue;
    if (!mergedById.has(config.id)) {
      mergedById.set(config.id, config);
    }
  }
  return Array.from(mergedById.values());
}

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
        const base =
          get().panelConfigs[panelId] ??
          buildPanelConfigFromRegistry(panelId) ?? {
            id: panelId,
            enabled: true,
            settings: {},
          };
        set((state) => ({
          panelConfigs: {
            ...state.panelConfigs,
            [panelId]: {
              ...base,
              ...config,
            },
          },
        }));
      },

      getPanelConfig: (panelId) => {
        return get().panelConfigs[panelId] ?? buildPanelConfigFromRegistry(panelId);
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

        const config = get().getPanelConfig(panelId);
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
        const configs = getRegistryBackedPanelConfigs(get().panelConfigs);
        return configs
          .filter((config) => config.enabled)
          .map((config) => config.id);
      },

      getPanelsByCategory: (category) => {
        const configs = getRegistryBackedPanelConfigs(get().panelConfigs);
        return configs.filter(
          (config) => config.category === category,
        );
      },

      searchPanels: (query) => {
        const configs = getRegistryBackedPanelConfigs(get().panelConfigs);
        const lowerQuery = query.toLowerCase();

        if (!lowerQuery.trim()) {
          return configs;
        }

        return configs.filter((config) => {
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
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<PanelConfigState> | undefined) ?? {};
        const current = currentState as PanelConfigState & PanelConfigActions;
        return {
          ...current,
          ...persisted,
          panelConfigs: {
            ...(current.panelConfigs ?? {}),
            ...(persisted.panelConfigs ?? {}),
          },
        };
      },
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

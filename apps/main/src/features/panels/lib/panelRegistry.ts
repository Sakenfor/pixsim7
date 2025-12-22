/**
 * Panel Registry
 *
 * Dynamic panel registration system for workspace panels.
 * Part of Task 50 Phase 50.3 - Plugin-based Panel Registry
 */

import type { PanelId } from "../../stores/workspaceStore";
import type { ComponentType } from "react";
import { BaseRegistry } from "../../../lib/core/BaseRegistry";
import type { EditorContext } from "../../context/editorContext";
import type { PanelCategory } from "./panelConstants";
import type { SettingGroup, SettingTab } from "@features/settings/lib/core/types";
import type { z } from "zod";
import type { PanelMetadata } from "./types";
import type { BasePanelDefinition, PanelRegistryLike } from "./panelTypes";

// Re-export PanelCategory for backwards compatibility
export type { PanelCategory } from "./panelConstants";
export {
  PANEL_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from "./panelConstants";

/**
 * Context label strategy for panel headers.
 * - 'scene': Shows "Scene: {title}" when available
 * - 'world': Shows "World #{id}" when available
 * - 'session': Shows "Session #{id}" or falls back to world
 * - 'preset': Shows "Preset: {id}" when available
 * - function: Custom derivation from EditorContext
 */
export type ContextLabelStrategy =
  | "scene"
  | "world"
  | "session"
  | "preset"
  | ((ctx: EditorContext) => string | undefined);

export interface WorkspaceContext {
  currentSceneId?: string | null;
  [key: string]: unknown;
}

/**
 * Core editor role identifies panels as primary editing surfaces.
 * - 'game-view': The canonical runtime/play viewport (Game2D)
 * - 'flow-view': The canonical logic/flow editor (Scene Graph)
 * - 'world-editor': The world/location editor (GameWorld)
 */
export type CoreEditorRole = "game-view" | "flow-view" | "world-editor";

export type PanelOrchestrationMetadata = Omit<PanelMetadata, "id" | "title">;

/**
 * Settings update helpers provided to panel settings components.
 * Centralizes persistence and debouncing logic.
 */
export interface PanelSettingsUpdateHelpers<TSettings = any> {
  /** Update settings with a partial patch (shallow merge) */
  update: (patch: Partial<TSettings>) => void;
  /** Set a specific setting value by path (deep set with dot notation) */
  set: <K extends keyof TSettings>(key: K, value: TSettings[K]) => void;
  /** Replace entire settings object */
  replace: (settings: TSettings) => void;
}

/**
 * Props passed to panel settings components
 */
export interface PanelSettingsProps<TSettings = any> {
  /** Current settings for the panel */
  settings: TSettings;
  /** Update helpers (update, set, replace) */
  helpers: PanelSettingsUpdateHelpers<TSettings>;
}

/**
 * A section within a panel's settings UI.
 * Allows large panels to organize settings into multiple sections.
 */
export interface PanelSettingsSection<TSettings = any> {
  /** Unique section ID */
  id: string;
  /** Display title for the section */
  title: string;
  /** Description shown below the title */
  description?: string;
  /** Component that renders this section's settings */
  component: ComponentType<PanelSettingsProps<TSettings>>;
}

/**
 * Optional settings tab definition for panel settings UI.
 */
export interface PanelSettingsTab<TSettings = any> {
  /** Unique tab ID */
  id: string;
  /** Tab label shown in the UI */
  label: string;
  /** Optional tab description */
  description?: string;
  /** Tab sort order (lower first) */
  order?: number;
  /** Component that renders the tab content */
  component: ComponentType<PanelSettingsProps<TSettings>>;
}

export interface PanelSettingsFormSchema {
  tabs?: SettingTab[];
  groups?: SettingGroup[];
}

/**
 * Full panel definition for workspace panels.
 * Extends BasePanelDefinition with rich metadata, settings, and orchestration.
 */
export interface PanelDefinition<TSettings = any> extends BasePanelDefinition {
  id: PanelId;
  category: PanelCategory;
  tags: string[];
  description?: string;

  // Settings System
  /**
   * Default settings for the panel.
   * Used when panel is first registered or settings are reset.
   */
  defaultSettings?: TSettings;

  /**
   * Zod schema for validating and type-checking settings.
   * Used to validate stored settings and provide defaults.
   */
  settingsSchema?: z.ZodSchema<TSettings>;

  /**
   * Single settings component for simple panels.
   * Mutually exclusive with settingsSections.
   */
  settingsComponent?: ComponentType<PanelSettingsProps<TSettings>>;

  /**
   * Multiple settings sections for complex panels.
   * Allows organizing settings into collapsible/tabbed sections.
   * Mutually exclusive with settingsComponent.
   */
  settingsSections?: PanelSettingsSection<TSettings>[];

  /**
   * Optional extra tabs for panel settings UI.
   * These are additive and rendered alongside default tabs.
   */
  settingsTabs?: PanelSettingsTab<TSettings>[];
  /**
   * Declarative settings schema for auto-rendered panel settings.
   * Used when no custom settingsComponent/settingsSections are provided.
   */
  settingsForm?: PanelSettingsFormSchema;
  /**
   * Component settings to surface alongside panel settings.
   * Refer to componentRegistry IDs.
   */
  componentSettings?: string[];

  /**
   * Settings version for migration support.
   * Increment when settings structure changes.
   */
  settingsVersion?: number;

  /**
   * Migration hook to upgrade old settings to current version.
   * Called when stored settings version < current settingsVersion.
   *
   * @param oldSettings - Settings from storage (unknown structure)
   * @param oldVersion - Version number from storage (0 if not present)
   * @returns Migrated settings matching current TSettings type
   */
  migrateSettings?: (oldSettings: unknown, oldVersion: number) => TSettings;

  /**
   * Strategy for deriving the context label shown in the panel header.
   * If undefined, no context label is shown.
   */
  contextLabel?: ContextLabelStrategy;

  /**
   * Identifies this panel as a core editor surface.
   * Core editors are the primary editing surfaces in the workspace:
   * - game-view: Runtime/play viewport (Game2D)
   * - flow-view: Logic/flow editor (Scene Graph)
   * - world-editor: World/location editor (GameWorld)
   *
   * Satellite panels (tools, inspectors) should not set this property.
   */
  coreEditorRole?: CoreEditorRole;

  // Visibility predicates
  showWhen?: (context: WorkspaceContext) => boolean;

  /**
   * Orchestration metadata for PanelManager (zones, interactions, dockview).
   * When provided, this panel participates in the panel interaction system.
   */
  orchestration?: PanelOrchestrationMetadata;

  // Lifecycle hooks
  onMount?: () => void;
  onUnmount?: () => void;

  // Capabilities
  supportsCompactMode?: boolean;
  supportsMultipleInstances?: boolean;
  requiresContext?: boolean;
}

/**
 * PanelRegistry - Centralized registry for all workspace panels.
 * Implements PanelRegistryLike for compatibility with SmartDockview.
 */
export class PanelRegistry
  extends BaseRegistry<PanelDefinition>
  implements PanelRegistryLike<PanelDefinition> {
  /**
   * Unregister a panel
   * Calls onUnmount hook before removing the panel.
   */
  unregister(panelId: PanelId): boolean {
    const definition = this.items.get(panelId);
    if (definition) {
      // Call cleanup hook
      if (definition.onUnmount) {
        try {
          definition.onUnmount();
        } catch (error) {
          console.error(`Error in onUnmount for panel "${panelId}":`, error);
        }
      }

      return super.unregister(panelId);
    }
    return false;
  }

  /**
   * Get panels by category
   */
  getByCategory(category: string): PanelDefinition[] {
    return this.getAll().filter((panel) => panel.category === category);
  }

  /**
   * Get panels that should appear in user-facing lists.
   */
  getPublicPanels(): PanelDefinition[] {
    return this.getAll().filter((panel) => !panel.isInternal);
  }

  /**
   * Search panels by query (searches id, title, description, tags)
   */
  search(query: string): PanelDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter((panel) => {
      const matchesId = panel.id.toLowerCase().includes(lowerQuery);
      const matchesTitle = panel.title.toLowerCase().includes(lowerQuery);
      const matchesDescription = panel.description
        ?.toLowerCase()
        .includes(lowerQuery);
      const matchesTags = panel.tags.some((tag) =>
        tag.toLowerCase().includes(lowerQuery),
      );

      return matchesId || matchesTitle || matchesDescription || matchesTags;
    });
  }

  /**
   * Get visible panels based on context
   */
  getVisiblePanels(context: WorkspaceContext): PanelDefinition[] {
    return this.getAll().filter((panel) => {
      if (!panel.showWhen) return true;
      try {
        return panel.showWhen(context);
      } catch (error) {
        console.error(`Error in showWhen for panel "${panel.id}":`, error);
        return false;
      }
    });
  }

  /**
   * Clear all panels (useful for testing)
   * Calls onUnmount hook for each panel before clearing.
   */
  clear(): void {
    // Call onUnmount for all panels
    this.items.forEach((definition) => {
      if (definition.onUnmount) {
        try {
          definition.onUnmount();
        } catch (error) {
          console.error(
            `Error in onUnmount for panel "${definition.id}":`,
            error,
          );
        }
      }
    });

    super.clear();
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const all = this.getAll();
    return {
      total: all.length,
      byCategory: {
        workspace: all.filter((p) => p.category === "workspace").length,
        scene: all.filter((p) => p.category === "scene").length,
        game: all.filter((p) => p.category === "game").length,
        dev: all.filter((p) => p.category === "dev").length,
        tools: all.filter((p) => p.category === "tools").length,
        utilities: all.filter((p) => p.category === "utilities").length,
        system: all.filter((p) => p.category === "system").length,
        custom: all.filter((p) => p.category === "custom").length,
      },
      capabilities: {
        supportsCompactMode: all.filter((p) => p.supportsCompactMode).length,
        supportsMultipleInstances: all.filter(
          (p) => p.supportsMultipleInstances,
        ).length,
        requiresContext: all.filter((p) => p.requiresContext).length,
      },
    };
  }
}

// Global panel registry singleton
export const panelRegistry = new PanelRegistry();

/**
 * Register a simple panel to the global registry.
 * Use this for panels that don't need the full PanelDefinition features
 * (settings system, orchestration, lifecycle hooks, etc.)
 *
 * @param panel - Base panel definition with minimal required fields
 */
export function registerSimplePanel(panel: BasePanelDefinition): void {
  // Convert to full PanelDefinition with defaults
  const fullDefinition: PanelDefinition = {
    ...panel,
    id: panel.id as PanelId,
    category: (panel.category ?? 'custom') as PanelCategory,
    tags: panel.tags ?? [],
  };

  panelRegistry.register(fullDefinition);
}

/**
 * Get panels by a specific tag
 */
export function getPanelsByTag(tag: string): PanelDefinition[] {
  return panelRegistry.getAll().filter(p => p.tags?.includes(tag));
}

/**
 * Get panel IDs by tag (useful for globalPanelIds)
 */
export function getPanelIdsByTag(tag: string): string[] {
  return getPanelsByTag(tag).map(p => p.id);
}

/**
 * Get panels available in a specific dockview scope.
 * Filters by `availableIn` field on panel definitions.
 *
 * @param scope - Dockview scope ID (e.g., "workspace", "control-center", "asset-viewer")
 * @returns Panels that declare this scope in their `availableIn` array, sorted by order
 */
export function getPanelsForScope(scope: string): PanelDefinition[] {
  return panelRegistry
    .getAll()
    .filter(p => p.availableIn?.includes(scope))
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

/**
 * Get panel IDs available in a specific dockview scope.
 *
 * @param scope - Dockview scope ID
 * @returns Panel IDs that declare this scope in their `availableIn` array
 */
export function getPanelIdsForScope(scope: string): string[] {
  return getPanelsForScope(scope).map(p => p.id);
}

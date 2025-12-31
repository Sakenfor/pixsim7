/**
 * Panel Constants
 *
 * Centralized definitions for panel categories, labels, and ordering.
 * Single source of truth for panel classification across the codebase.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Panel Categories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All valid panel categories.
 *
 * Categories are used for:
 * - Grouping panels in the add panel dropdown
 * - Visual styling of panel headers
 * - Filtering in panel configuration UI
 */
export const PANEL_CATEGORIES = [
  "workspace", // Gallery, Graph, Inspector
  "scene", // Scene Builder, Scene Management, Scene Library
  "game", // Game Theming, Game iframe
  "generation", // QuickGen, Presets, Composition Roles
  "dev", // Dev Tools panel
  "tools", // Gizmo Lab, NPC Brain Lab, HUD Designer
  "utilities", // Export/Import, Validation, Settings
  "system", // Health, Provider Settings
  "custom", // Custom panels from plugins
] as const;

export type PanelCategory = (typeof PANEL_CATEGORIES)[number];

/**
 * Check if a string is a valid PanelCategory
 */
export function isValidPanelCategory(value: string): value is PanelCategory {
  return PANEL_CATEGORIES.includes(value as PanelCategory);
}

// ─────────────────────────────────────────────────────────────────────────────
// Category Display Labels
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Human-readable labels for each category.
 * Used in dropdowns, headers, and configuration UI.
 */
export const CATEGORY_LABELS: Record<PanelCategory, string> = {
  workspace: "Workspace",
  scene: "Scene",
  game: "Game",
  generation: "Generation",
  dev: "Development",
  tools: "Tools",
  utilities: "Utilities",
  system: "System",
  custom: "Custom",
};

// ─────────────────────────────────────────────────────────────────────────────
// Category Display Order
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Order in which categories should be displayed in UI.
 * Core workspace categories first, then domain-specific, then system/custom.
 */
export const CATEGORY_ORDER: readonly PanelCategory[] = [
  "workspace",
  "scene",
  "game",
  "generation",
  "dev",
  "tools",
  "utilities",
  "system",
  "custom",
];

// ─────────────────────────────────────────────────────────────────────────────
// Category Visual Styling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Color identifiers for each category.
 * Used for visual distinction in panel headers and badges.
 */
export const CATEGORY_COLORS: Record<PanelCategory, string> = {
  workspace: "blue",
  scene: "purple",
  game: "green",
  generation: "emerald",
  dev: "orange",
  tools: "cyan",
  utilities: "gray",
  system: "red",
  custom: "pink",
};

/**
 * Tailwind color classes for category badges.
 * Returns both light and dark mode classes.
 */
export function getCategoryColorClasses(category: PanelCategory): string {
  const colorMap: Record<PanelCategory, string> = {
    workspace:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    scene:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    game: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    generation:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    dev: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    tools: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
    utilities:
      "bg-gray-100 text-gray-700 dark:bg-gray-700/30 dark:text-gray-300",
    system: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    custom: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  };
  return colorMap[category] || colorMap.custom;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Category Mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps legacy category names to current categories.
 * Used for backwards compatibility with older panel configurations.
 */
export const LEGACY_CATEGORY_MAP: Record<string, PanelCategory> = {
  core: "workspace",
  development: "dev",
  world: "scene", // 'world' was used in some UIs, maps to 'scene'
};

/**
 * Normalize a category value, mapping legacy names to current categories.
 */
export function normalizeCategory(category: string): PanelCategory {
  if (isValidPanelCategory(category)) {
    return category;
  }
  return LEGACY_CATEGORY_MAP[category] || "custom";
}

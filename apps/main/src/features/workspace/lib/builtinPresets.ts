/**
 * Built-in Presets
 *
 * Declarative preset definitions with layout recipes.
 * These are code-defined and never persisted to storage.
 */

import type { PresetScope, LayoutPreset } from "../stores/workspaceStore";

import type { LayoutRecipe } from "./layoutRecipes";

export interface BuiltinPreset {
  id: string;
  name: string;
  scope: PresetScope;
  description: string;
  icon: string;
  recipe: LayoutRecipe;
  graphEditorId?: string;
}

const BUILTIN_PRESETS: BuiltinPreset[] = [
  // ── Workspace presets ─────────────────────────────────────────────
  {
    id: "default",
    name: "Default Workspace",
    scope: "workspace",
    description: "Balanced layout for general development",
    icon: "🏠",
    recipe: {
      panels: [
        { id: "gallery", position: { direction: "left" } },
        { id: "health", position: { direction: "below", referencePanel: "gallery" } },
        { id: "project", position: { direction: "below", referencePanel: "health" } },
        { id: "graph", position: { direction: "right" } },
        { id: "inspector", position: { direction: "right", referencePanel: "graph" } },
        { id: "game", position: { direction: "below", referencePanel: "inspector" } },
      ],
      ensurePanels: ["gallery", "health", "project", "graph", "inspector", "game"],
    },
  },
  {
    id: "minimal",
    name: "Minimal",
    scope: "workspace",
    description: "Focus on graph editing and game preview",
    icon: "⚡",
    recipe: {
      panels: [
        { id: "graph", position: { direction: "left" } },
        { id: "game", position: { direction: "right" } },
        { id: "inspector", position: { direction: "within", referencePanel: "game" } },
      ],
    },
  },
  {
    id: "creative",
    name: "Creative Studio",
    scope: "workspace",
    description: "Optimized for content creation",
    icon: "🎨",
    recipe: {
      panels: [
        { id: "gallery", position: { direction: "left" }, initialWidth: 450 },
        { id: "graph", position: { direction: "right" } },
        { id: "inspector", position: { direction: "right", referencePanel: "graph" } },
        { id: "game", position: { direction: "below", referencePanel: "inspector" } },
        { id: "generations", position: { direction: "within", referencePanel: "gallery" } },
      ],
    },
  },
  {
    id: "narrative-flow",
    name: "Narrative & Flow",
    scope: "workspace",
    description: "Flow View-centric layout for designing scenes",
    icon: "🔀",
    graphEditorId: "scene-graph-v2",
    recipe: {
      panels: [
        { id: "graph", position: { direction: "left" }, initialWidth: 700 },
        { id: "inspector", position: { direction: "right" } },
        { id: "scene-management", position: { direction: "below", referencePanel: "inspector" } },
        { id: "game", position: { direction: "below", referencePanel: "graph" } },
      ],
    },
  },
  {
    id: "playtest-tuning",
    name: "Playtest & Tuning",
    scope: "workspace",
    description: "Game View-centric layout for playtesting",
    icon: "🎮",
    recipe: {
      panels: [
        { id: "game", position: { direction: "left" }, initialWidth: 600 },
        { id: "inspector", position: { direction: "right" } },
        { id: "health", position: { direction: "below", referencePanel: "inspector" } },
        { id: "graph", position: { direction: "within", referencePanel: "game" } },
        { id: "game-tools", position: { direction: "within", referencePanel: "health" } },
      ],
    },
  },
  {
    id: "dev-default",
    name: "Dev – Debug",
    scope: "workspace",
    description: "Graph, dev tools, and health monitoring",
    icon: "🧪",
    graphEditorId: "scene-graph-v2",
    recipe: {
      panels: [
        { id: "graph", position: { direction: "left" } },
        { id: "inspector", position: { direction: "right" } },
        { id: "dev-tools", position: { direction: "below", referencePanel: "graph" } },
        { id: "console", position: { direction: "within", referencePanel: "dev-tools" } },
        { id: "health", position: { direction: "below", referencePanel: "inspector" } },
        { id: "game", position: { direction: "within", referencePanel: "health" } },
      ],
    },
  },

];

/** Convert a built-in preset to the LayoutPreset shape used by the store/UI. */
function toLayoutPreset(b: BuiltinPreset): LayoutPreset {
  return {
    id: b.id,
    name: b.name,
    scope: b.scope,
    description: b.description,
    icon: b.icon,
    isDefault: true,
    layout: null,
    graphEditorId: b.graphEditorId,
  };
}

/** Get built-in presets for a scope as LayoutPreset objects (ready for UI). */
export function getBuiltinLayoutPresetsForScope(scope: PresetScope): LayoutPreset[] {
  return getBuiltinPresetsForScope(scope).map(toLayoutPreset);
}

/** Look up a built-in preset by ID. */
export function getBuiltinPreset(id: string): BuiltinPreset | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id);
}

/** Get all built-in presets for a given scope. */
export function getBuiltinPresetsForScope(scope: PresetScope): BuiltinPreset[] {
  return BUILTIN_PRESETS.filter((p) => p.scope === scope || p.scope === "all");
}

/** Check whether a preset ID belongs to a built-in preset. */
export function isBuiltinPreset(id: string): boolean {
  return BUILTIN_PRESETS.some((p) => p.id === id);
}

/** All built-in preset IDs (for migration filtering). */
export const BUILTIN_PRESET_IDS = new Set(BUILTIN_PRESETS.map((p) => p.id));

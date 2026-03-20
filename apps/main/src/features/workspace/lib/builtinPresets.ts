/**
 * Built-in Presets
 *
 * Infrastructure for code-defined layout presets.
 * Currently empty — presets are user-saved only.
 * Built-in presets may be re-introduced via context menu or other UX later.
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

const BUILTIN_PRESETS: BuiltinPreset[] = [];

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

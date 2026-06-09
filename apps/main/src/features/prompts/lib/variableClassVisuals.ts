/**
 * variableClassVisuals — colour + icon for a default variable class, linked to
 * the shared role taxonomy. A class config (promptVariableName.ts) either names
 * a `compositionRole` (colour/icon derived from the role vocab, single source
 * of truth) or carries an explicit colour/icon (for classes with no role, e.g.
 * GOAL). Returns null for non-default classes.
 */
import { ROLE_COLORS } from '@pixsim7/shared.types/composition-roles.generated';

import { getRoleIcon } from '@lib/blockVisuals';
import type { IconName } from '@lib/icons';

import { DEFAULT_VARIABLE_CLASSES, parseVariableName } from './promptVariableName';

// Colour-name → dot/background tailwind class. Mirrors the role-colour palette
// (incl. 'slate' used by camera roles). Kept local so this stays a thin view
// helper without exporting promptRoleUi internals.
const COLOR_DOT: Record<string, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  purple: 'bg-purple-500',
  yellow: 'bg-yellow-500',
  pink: 'bg-pink-500',
  cyan: 'bg-cyan-500',
  orange: 'bg-orange-500',
  slate: 'bg-slate-500',
  gray: 'bg-neutral-500',
  red: 'bg-red-500',
  emerald: 'bg-emerald-500',
};
const DEFAULT_DOT = 'bg-neutral-400';

// Colour-name → hex, for contexts that need a raw colour (e.g. CodeMirror
// inline decoration styles where a tailwind class can't be applied).
const COLOR_HEX: Record<string, string> = {
  blue: '#3b82f6',
  green: '#22c55e',
  purple: '#a855f7',
  yellow: '#eab308',
  pink: '#ec4899',
  cyan: '#06b6d4',
  orange: '#f97316',
  slate: '#64748b',
  gray: '#64748b',
  red: '#ef4444',
  emerald: '#10b981',
};

function roleColorName(roleId: string): string | undefined {
  const colors = ROLE_COLORS as Record<string, string>;
  if (colors[roleId]) return colors[roleId];
  const group = roleId.split(':')[0];
  return colors[group];
}

export interface VariableClassVisual {
  icon: IconName;
  /** Tailwind background class for a colour dot/badge. */
  dotClass: string;
  /** Resolved colour name (e.g. 'blue'), if any. */
  colorName?: string;
  /** Resolved colour hex, for raw-colour contexts (e.g. CodeMirror styles). */
  hex?: string;
}

/** Visual identity for a variable's class, or null when the class isn't a default. */
export function getVariableClassVisual(name: string): VariableClassVisual | null {
  const { className } = parseVariableName(name);
  const config = DEFAULT_VARIABLE_CLASSES[className];
  if (!config) return null;

  const icon: IconName = config.icon
    ? (config.icon as IconName)
    : config.compositionRole
      ? getRoleIcon(config.compositionRole)
      : 'blocks';

  const colorName =
    config.color ?? (config.compositionRole ? roleColorName(config.compositionRole) : undefined);
  const dotClass = colorName ? (COLOR_DOT[colorName] ?? DEFAULT_DOT) : DEFAULT_DOT;
  const hex = colorName ? COLOR_HEX[colorName] : undefined;

  return { icon, dotClass, colorName, hex };
}

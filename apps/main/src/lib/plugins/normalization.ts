/**
 * Plugin Family & Origin Normalization
 *
 * Mapping between bundle families, legacy origins, and canonical plugin types.
 */

import type { UnifiedPluginOrigin, UnifiedPluginFamily } from './descriptor';

// ============================================================================
// Origin Normalization
// ============================================================================

/**
 * Normalize plugin origin from any source system
 *
 * Maps legacy origins to canonical origins:
 * - `plugins-dir` -> `plugin-dir`
 * - `dev` -> `dev-project`
 */
export function normalizeOrigin(origin: string): UnifiedPluginOrigin {
  switch (origin) {
    case 'builtin':
      return 'builtin';
    case 'plugin-dir':
    case 'plugins-dir': // Legacy
      return 'plugin-dir';
    case 'ui-bundle':
      return 'ui-bundle';
    case 'dev':
    case 'dev-project':
      return 'dev-project';
    default:
      console.warn(`Unknown plugin origin: ${origin}, defaulting to 'plugin-dir'`);
      return 'plugin-dir';
  }
}

// ============================================================================
// Family Normalization
// ============================================================================

/**
 * Bundle family types (from manifest.json)
 *
 * These are the families used in bundle manifests and backend APIs.
 * Use `bundleFamilyToUnified()` to convert to canonical `UnifiedPluginFamily`.
 */
export type BundleFamily = 'scene' | 'ui' | 'tool' | 'control-center';

/**
 * Valid bundle family values for runtime checking
 */
export const BUNDLE_FAMILIES: readonly BundleFamily[] = ['scene', 'ui', 'tool', 'control-center'] as const;

/**
 * Type guard to check if a string is a valid BundleFamily
 */
export function isBundleFamily(value: string): value is BundleFamily {
  return BUNDLE_FAMILIES.includes(value as BundleFamily);
}

/**
 * Map bundle family to canonical plugin family
 */
export function bundleFamilyToUnified(bundleFamily: BundleFamily): UnifiedPluginFamily {
  switch (bundleFamily) {
    case 'scene':
      return 'scene-view';
    case 'ui':
      return 'ui-plugin';
    case 'tool':
      return 'ui-plugin';
    case 'control-center':
      return 'control-center';
  }
}

/**
 * Map canonical family back to bundle family (if applicable)
 */
export function unifiedFamilyToBundleFamily(family: UnifiedPluginFamily): BundleFamily | null {
  switch (family) {
    case 'scene-view':
      return 'scene';
    case 'ui-plugin':
      return 'ui'; // or 'tool', depends on context
    case 'control-center':
      return 'control-center';
    default:
      return null; // Not a bundle-loadable family
  }
}

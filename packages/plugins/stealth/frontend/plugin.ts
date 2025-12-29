/**
 * @pixsim7/plugin-stealth - Frontend Plugin Example
 *
 * This file demonstrates how the pickpocket interaction would be built
 * from the manifest. In practice, interactions are loaded dynamically
 * via the dynamicLoader using the backend's frontend_manifest.
 *
 * For direct bundling (not recommended), the main app's dynamicLoader
 * can be used with the manifest from shared/types.ts.
 *
 * @example Dynamic loading (recommended):
 * ```ts
 * // In app initialization
 * import { initializeInteractions } from '@/lib/game/interactions';
 * await initializeInteractions(); // Loads pickpocket from backend
 * ```
 *
 * @example Direct use of types:
 * ```ts
 * import type { PickpocketConfig, PickpocketRequest } from '@pixsim7/plugin-stealth/types';
 * ```
 */

export {
  PICKPOCKET_FRONTEND_MANIFEST,
  PICKPOCKET_CONFIG_SCHEMA,
  STEALTH_FRONTEND_MANIFEST,
  type PickpocketConfig,
  type PickpocketRequest,
  type PickpocketResponse,
  type FrontendInteractionManifest,
  type FrontendPluginManifest,
} from '../shared/types';

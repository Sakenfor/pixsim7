/**
 * Console Manifests
 *
 * Declarative pattern for console module registration.
 * Each manifest declares its operations, data stores, and dependencies.
 *
 * Manifests are feature-owned:
 * - Core manifest lives here (cross-feature)
 * - Workspace manifest in features/workspace/lib/consoleManifest.ts
 * - Stats manifest in features/gizmos/lib/consoleStatsManifest.ts
 * - Tools manifest in features/gizmos/lib/consoleToolsManifest.ts
 */

// Types
export type {
  ConsoleManifest,
  CategoryDeclaration,
  OperationDeclaration,
  OpsDeclaration,
  ManifestRegistrationContext,
} from './types';

// Helpers for reducing ops boilerplate
export { categoryOps, param, optParam, type OpDef } from './helpers';

// Registration helper
export { registerConsoleManifest, registerConsoleManifests } from './registerManifest';

// Core manifest (cross-feature, lives here)
export { coreManifest } from './core';

// Feature-owned manifests (re-exported for convenience)
export { workspaceManifest } from '@features/workspace/lib/consoleManifest';
export { statsManifest } from '@features/gizmos/lib/consoleStatsManifest';
export { toolsManifest } from '@features/gizmos/lib/consoleToolsManifest';

/**
 * Console Manifests
 *
 * Declarative pattern for console module registration.
 * Each manifest declares its operations, data stores, and dependencies.
 */

// Types
export type {
  ConsoleManifest,
  CategoryDeclaration,
  OperationDeclaration,
  OpsDeclaration,
  ManifestRegistrationContext,
} from './types';

// Registration helper
export { registerConsoleManifest, registerConsoleManifests } from './registerManifest';

// Manifests
export { coreManifest } from './core';
export { workspaceManifest } from './workspace';
export { statsManifest } from './stats';
export { toolsManifest } from './tools';

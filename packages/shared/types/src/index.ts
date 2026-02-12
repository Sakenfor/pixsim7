// Shared types exported by @pixsim7/types

// ===================
// Canonical Entity IDs
// ===================

// Named exports (existing imports)
export * from './ids';

// Namespace export (new pattern: import { IDs } from '@pixsim7/shared.types')
export * as IDs from './ids';

// Runtime ref builders (Ref.*)
export { Ref } from '@pixsim7/shared.ref.core';

// ===================
// Scene Graph Types
// ===================

// Named exports (existing imports)
export * from './sceneGraph';

// Namespace export (new pattern: import { SceneGraph } from '@pixsim7/shared.types')
export * as SceneGraph from './sceneGraph';

// ===================
// Game DTOs
// ===================

// Named exports (existing imports)
export * from './game';

// Namespace export (new pattern: import { Game } from '@pixsim7/shared.types')
export * as Game from './game';

// Character Identity Graph
export * from './characterGraph';

// ===================
// Template/Runtime Links Types
// ===================

export * from './links';

export type JobStatus = 'queued' | 'pending' | 'processing' | 'completed' | 'failed';

export interface JobSummary {
  id: number;
  status: JobStatus;
  operation_type: string;
  provider_id: string;
}

export interface ProviderCapabilitySummary {
  id: string;
  name: string;
  supportsMultiAccounts?: boolean;
  supportsApiKey?: boolean;
  supportsPriority?: boolean;
}

// ===================
// Dynamic Generation Types
// ===================

export * from './generation'

// ===================
// Node Type Registry
// ===================
// NOTE: Node type registry and registrars moved to @pixsim7/shared.graph.core
// Import from there for NodeTypeRegistry, registerBuiltinNodeTypes, etc.
export type {
  NodeTypeDefinition,
  NodeTypeRegistryOptions,
  PortDefinition,
  PortConfig,
} from './nodeTypeRegistry';

// NPC Zones (types only)
export * from './npcZones'
export * from './npcZoneTracking'

// ===================
// Game DTO Types
// ===================

export * from './game'

// ===================
// NPC Interaction Types
// ===================

export * from './interactions'

// ===================
// Generic Surface Gizmo Types
// ===================

export * from './gizmos'

// Namespace export for organized access
export * as Gizmos from './gizmos'

// ===================
// User Preferences Types
// ===================

export * from './userPreferences'

// ===================
// Intimacy & Progression Types
// ===================

export * from './intimacy'

// ===================
// Narrative Runtime Types
// ===================

export * from './narrative'

// ===================
// Content Rating Utilities
// ===================


// ===================
// Prompt Types
// ===================

export * from './prompt'

// ===================
// Brain State Types
// ===================

export * from './brain'

// ===================
// Action Types
// ===================

export * from './actions'

// Namespace export for organized access
export * as Actions from './actions'

// ===================
// Docs Types
// ===================

export * from './docs'

// ===================
// App Map Types
// ===================

export * from './appMap'

// ===================
// Asset Provider Types
// ===================

export * from './assetProvider'

// ===================
// Asset Core Types (Shared between Backend & Frontend)
// ===================

export * from './asset-core'

// ===================
// Composition Roles (Generated)
// ===================

export * from './composition-roles.generated'

// ===================
// Prompt Roles (Generated)
// ===================

export * from './prompt-roles.generated'

// ===================
// Composition Packages
// ===================

export * from './compositionPackages'

// ===================
// Region Label Utilities
// ===================

export * from './regionHelpers'

// ===================
// World Configuration Schemas
// ===================

export * from './worldConfig'

// Namespace export for organized access
export * as WorldConfig from './worldConfig'

// ===================
// Upload Context Schema (Generated)
// ===================

export * from './upload-context.generated'

// ===================
// Backend OpenAPI Contract (Generated)
// ===================
//
// These types are auto-generated from the running backend's /openapi.json
// endpoint using `pnpm openapi:gen`. DO NOT manually edit openapi.generated.ts.
//
// Conventions:
//   - OpenAPI types = HTTP DTOs only (request/response schemas)
//   - Uses snake_case as backend returns (no camelCase mapping)
//   - Frontend API modules (lib/api/*.ts) re-export small aliases:
//       export type AssetResponse = ApiComponents['schemas']['AssetResponse']
//     so most code never touches ApiComponents[...] directly.
//
// Commands:
//   pnpm openapi:gen    - Regenerate types (requires running backend)
//   pnpm openapi:check  - Verify types are up-to-date (for CI/pre-commit)
//
// See also: Launcher GUI > Tools > OpenAPI Tools (for GUI-based generation)
//

export type {
  paths as ApiPaths,
  components as ApiComponents,
  operations as ApiOperations,
} from './openapi.generated';

// ===================
// OpenAPI Type Aliases
// ===================
// Common types exported directly for convenience

import type { components } from './openapi.generated';

/** Asset media type (video, image, audio, 3d_model) */
export type MediaType = components['schemas']['MediaType'];

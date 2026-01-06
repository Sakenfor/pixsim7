// Shared types exported by @pixsim7/types

// ===================
// Canonical Entity IDs
// ===================

// Named exports (existing imports)
export * from './ids';

// Namespace export (new pattern: import { IDs } from '@shared/types')
export * as IDs from './ids';

// ===================
// Scene Graph Types
// ===================

// Named exports (existing imports)
export * from './sceneGraph';

// Namespace export (new pattern: import { SceneGraph } from '@shared/types')
export * as SceneGraph from './sceneGraph';

// ===================
// Game DTOs
// ===================

// Named exports (existing imports)
export * from './game';

// Namespace export (new pattern: import { Game } from '@shared/types')
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

export * from './nodeTypeRegistry'
export * from './builtinNodeTypes'
export * from './arcNodeTypes'
export * from './npcResponseNode'
export * from './intimacyNodeTypes'
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
// Composition Packages
// ===================

export * from './compositionPackages'

// ===================
// Region Labels (Generated)
// ===================

export * from './region-labels.generated'

// ===================
// World Configuration Schemas
// ===================

export * from './worldConfig'

// Namespace export for organized access
export * as WorldConfig from './worldConfig'

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

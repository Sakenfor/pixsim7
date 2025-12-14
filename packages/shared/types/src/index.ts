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

// Namespace export (new pattern: import { Scene } from '@shared/types')
export * as Scene from './sceneGraph';

// ===================
// Game DTOs
// ===================

// Named exports (existing imports)
export * from './game';

// Namespace export (new pattern: import { Game } from '@shared/types')
export * as Game from './game';

// Character Identity Graph
export * from './characterGraph';

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
// Asset Provider Types
// ===================

export * from './assetProvider'

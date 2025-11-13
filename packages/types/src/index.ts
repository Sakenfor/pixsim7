// Shared types exported by @pixsim7/types

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
// Scene Graph Types
// ===================

export type SceneNodeType = 'video' | 'action'

export interface MediaSegment {
  id: string
  url: string
  durationSec?: number
  tags?: string[]
}

export type SelectionStrategy =
  | { kind: 'ordered' }
  | { kind: 'random' }
  | { kind: 'pool'; filterTags?: string[]; count?: number }

export type PlaybackMode =
  | { kind: 'normal'; segmentId?: string }
  | { kind: 'loopSegment'; segmentId?: string; start?: number; end?: number }
  | { kind: 'progression'; segments: Array<{ label: string; segmentIds?: string[] }>; miniGame?: { id: 'reflex'; config?: Record<string, any> } }

export interface SceneNode {
  id: string
  type: SceneNodeType
  label?: string
  mediaUrl?: string // legacy single-clip
  media?: MediaSegment[] // modular clips for this node
  selection?: SelectionStrategy // how to pick from media
  playback?: PlaybackMode
  // optional prompt or metadata
  meta?: Record<string, any>
}

export interface SceneEdgeCondition {
  key: string
  op?: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'includes'
  value: any
}

export interface SceneEdgeEffect {
  key: string
  op?: 'set' | 'inc' | 'dec' | 'push' | 'flag'
  value?: any
}

export interface SceneEdge {
  id: string
  from: string
  to: string
  label?: string
  conditions?: SceneEdgeCondition[]
  effects?: SceneEdgeEffect[]
  isDefault?: boolean // used when auto-advancing from a node
}

export interface Scene {
  id: string
  title?: string
  nodes: SceneNode[]
  edges: SceneEdge[]
  startNodeId: string
}

export interface SceneRuntimeState {
  currentNodeId: string
  flags: Record<string, any>
  progressionIndex?: number // for progression playback
  activeSegmentId?: string // currently selected segment within node
}

// ===================
// Dynamic Generation Types (exported below)
// ===================

export * from './generation'

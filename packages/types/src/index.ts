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

/**
 * Base node types that always exist
 * Custom types are registered via nodeTypeRegistry
 */
export type BaseSceneNodeType =
  | 'video'
  | 'action'
  | 'choice'
  | 'condition'
  | 'end'
  | 'scene_call'
  | 'return'
  | 'generation'
  | 'miniGame'
  | 'node_group';

/**
 * SceneNodeType can be any string, but base types are type-safe
 * Custom types: 'my_plugin:custom_node', 'mod:special_node', etc.
 */
export type SceneNodeType = BaseSceneNodeType | string;

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
  | { kind: 'progression'; segments: Array<{ label: string; segmentIds?: string[] }>; miniGame?: { id: string; config?: Record<string, any> } }

export interface SceneNode {
  id: string
  type: SceneNodeType
  label?: string
  mediaUrl?: string // legacy single-clip
  media?: MediaSegment[] // modular clips for this node
  selection?: SelectionStrategy // how to pick from media
  playback?: PlaybackMode

  // Choice node specific
  choices?: Array<{ label: string; targetNodeId: string }>

  // Condition node specific
  condition?: { key: string; op: string; value: any }
  trueTargetNodeId?: string
  falseTargetNodeId?: string

  // Scene call node specific
  targetSceneId?: string
  parameterBindings?: Record<string, any>
  returnRouting?: Record<string, string>

  // Return node specific
  returnPointId?: string
  returnValues?: Record<string, any>

  // End node specific
  endType?: 'success' | 'failure' | 'neutral'
  endMessage?: string

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

export interface SceneCallStackFrame {
  sceneId: string  // Scene that was called
  callerNodeId: string  // Node in caller scene that made the call
  returnPointId?: string  // Which return point to route back to
  parameters: Record<string, any>  // Parameters passed to the scene
  callerState: {  // State to restore when returning
    currentNodeId: string
    flags: Record<string, any>
  }
}

export interface SceneRuntimeState {
  currentNodeId: string
  currentSceneId?: string  // Track which scene we're currently in
  flags: Record<string, any>
  progressionIndex?: number // for progression playback
  activeSegmentId?: string // currently selected segment within node
  callStack?: SceneCallStackFrame[]  // Stack for scene calling
}

// ===================
// Dynamic Generation Types (exported below)
// ===================

export * from './generation'

// ===================
// Node Type Registry
// ===================

export * from './nodeTypeRegistry'
export * from './builtinNodeTypes'
export * from './arcNodeTypes'
export * from './npcResponseNode'

// ===================
// Game DTO Types
// ===================

export * from './game'

// ===================
// User Preferences Types
// ===================

export * from './userPreferences'

/**
 * Scene Graph Types
 *
 * Type definitions for scene content nodes, edges, and runtime state.
 * Used for interactive scenes with media, choices, conditions, and flow control.
 *
 * NOTE: These types define the INTERNAL structure of a scene (nodes and edges within a scene).
 * For scene TRANSITIONS between scenes in a narrative program, see narrative.ts
 */

// ===================
// Scene Node Types
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

// ===================
// Media & Playback
// ===================

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

// ===================
// Scene Content Node
// ===================

/**
 * Scene content node - represents a node within a scene's internal graph/flow.
 * Used for interactive scenes with media, choices, conditions, etc.
 *
 * NOTE: This is different from SceneTransitionNode (narrative.ts) which handles
 * transitions BETWEEN scenes in a narrative program.
 */
export interface SceneContentNode {
  nodeType: 'scene_content'; // Discriminator
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

// ===================
// Scene Edges
// ===================

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

// ===================
// Scene Definition
// ===================

export interface Scene {
  id: string
  title?: string
  nodes: SceneContentNode[]
  edges: SceneEdge[]
  startNodeId: string
}

// ===================
// Scene Runtime State
// ===================

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

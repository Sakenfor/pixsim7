import type { MediaSegment, SelectionStrategy, PlaybackMode } from '@lib/registries';

/**
 * Scene Builder Types - Scene as Function Architecture
 *
 * Scenes are reusable, parameterized templates that can:
 * - Accept input parameters
 * - Have multiple exit points with return values
 * - Be called from multiple locations
 * - Maintain local state separate from caller
 *
 * State management handled by graphStore (Zustand).
 */

// ===== Scene Parameters & Return Values =====

export type SceneParameterType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface SceneParameter {
  name: string
  type: SceneParameterType
  required: boolean
  defaultValue?: any
  description?: string
  validation?: {
    min?: number // for numbers
    max?: number
    pattern?: string // regex for strings
    enum?: any[] // allowed values
  }
}

export interface SceneReturnPoint {
  id: string
  label: string // e.g., "victory", "defeat", "fled"
  description?: string
  returnValues?: Record<string, SceneParameter> // Values returned through this exit
  color?: string // Visual color in editor
}

// ===== Scene Signature (Function-like Interface) =====

export interface SceneSignature {
  parameters: SceneParameter[]
  returnPoints: SceneReturnPoint[]
  isReusable: boolean // Can be called from multiple places
  description?: string
  tags?: string[] // For categorization/search
  version?: number // Track signature changes
}

// ===== Draft Scene Node Types =====

export interface BaseNodeData {
  id: string
  assetIds?: string[]
  segments?: MediaSegment[]
  selection?: SelectionStrategy
  playback?: PlaybackMode
  metadata?: Record<string, any>
}

// Scene Call Node - calls another scene as a function
export interface SceneCallNodeData extends BaseNodeData {
  type: 'scene_call'
  targetSceneId: string

  // Parameter bindings: map scene params to values/variables
  // Example: { enemy: "Goblin", difficulty: "${player.level}" }
  parameterBindings: Record<string, any>

  // Return routing: map return points to target nodes
  // Example: { victory: "node_7", defeat: "node_8", fled: "node_9" }
  returnRouting: Record<string, string> // returnPointId -> nodeId

  // Capture return values into variables
  // Example: { gold: "player.inventory.gold", xp: "player.stats.xp" }
  captureReturnValues?: Record<string, string>

  // Whether to pass parent state to child scene
  inheritParentState?: boolean
}

// Return Node - exits current scene through a return point
export interface ReturnNodeData extends BaseNodeData {
  type: 'return'
  returnPointId: string // Which return point to exit through
  returnValues?: Record<string, any> // Values to return
}

// Node Group - visual organization with collapse/expand and zoom navigation
// Uses React Flow's parent node system
export interface NodeGroupData extends BaseNodeData {
  type: 'node_group'

  // Which nodes are contained in this group (for tracking/queries)
  // Note: Children have their parentNode property set to this group's id
  childNodeIds: string[]

  // Visual state
  collapsed: boolean // Whether group is collapsed or expanded

  // Group styling
  color?: string // Border/header color
  icon?: string // Optional icon/emoji

  // Group dimensions (for React Flow parent node)
  width?: number
  height?: number

  // Navigation
  zoomLevel?: number // For nested zoom navigation

  // Group metadata
  description?: string
  tags?: string[]
}

// Union of all node types
export type DraftSceneNode =
  | (BaseNodeData & { type: 'video' })
  | (BaseNodeData & { type: 'choice' })
  | (BaseNodeData & { type: 'end' })
  | (BaseNodeData & { type: 'condition' })
  | (BaseNodeData & { type: 'generation' })
  | SceneCallNodeData
  | ReturnNodeData
  | NodeGroupData

// ===== Edge Metadata =====

export interface DraftEdgeMeta {
  fromPort?: string // 'default' | 'success' | 'failure' | return point id
  toPort?: string // 'input'
  conditions?: any[] // Future: conditional edge activation
  effects?: any[] // Future: side effects when edge is traversed

  // For return routing visualization
  isReturnRoute?: boolean
  returnPointId?: string
}

// Draft edge
export interface DraftEdge {
  id: string
  from: string
  to: string
  meta?: DraftEdgeMeta
}

// ===== Scene Definition =====

export interface DraftScene {
  id: string
  title: string
  nodes: DraftSceneNode[]
  edges: DraftEdge[]
  startNodeId?: string

  // Scene as Function signature
  signature?: SceneSignature

  // Metadata
  version?: number // for migration
  metadata?: Record<string, any>

  // Comic panels (optional)
  comicPanels?: SceneMetaComicPanel[];

  // Timestamps
  createdAt?: string
  updatedAt?: string
}

// ===== Comic Panel Support =====

/**
 * Represents a single comic panel within a scene
 * Panels are displayed as a sequence of images with optional captions
 */
export interface SceneMetaComicPanel {
  /** Unique identifier for the panel within this scene */
  id: string;

  /** Gallery asset ID or provider asset ID for the panel image */
  assetId: string;

  /** Optional text caption displayed under the panel */
  caption?: string;

  /** Optional tags for categorization (mood, location, etc.) */
  tags?: string[];
}

/**
 * Session flags for comic panel state
 * Used at runtime to track which panel is currently displayed
 */
export interface ComicSessionFlags {
  /** ID of the currently displayed panel */
  current_panel?: string;

  /** Optional chapter/issue identifier */
  chapter?: string;
}

// ===== Scene Library Metadata =====

export interface SceneMetadata {
  id: string
  title: string
  description?: string
  tags?: string[]
  isReusable: boolean

  // Usage tracking
  referencedBy: Array<{
    sceneId: string
    nodeIds: string[]
  }>

  // Statistics
  nodeCount: number
  callCount: number // How many times it's called

  createdAt: string
  updatedAt: string

  // Comic panels (optional)
  comicPanels?: SceneMetaComicPanel[];
}

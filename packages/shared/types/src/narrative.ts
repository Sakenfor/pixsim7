/**
 * Unified Narrative Program Schema
 *
 * This module defines the canonical schema for narrative programs that unify:
 * - Dialogue trees and conversation flows
 * - Action block sequences for visual content
 * - Scene transitions and generation launches
 * - Player choices with branching logic
 * - State effects (relationship changes, flags, etc.)
 *
 * These schemas are shared between frontend (composer/editor) and backend (runtime execution).
 *
 * @see docs/NARRATIVE_RUNTIME.md (to be created in Phase 20.8)
 * @see pixsim7/backend/main/domain/narrative/schema.py - Python/Pydantic equivalent
 */

// ============================================================================
// Base Types
// ============================================================================

/**
 * Unique identifier for a narrative program
 */
export type NarrativeProgramId = string;

/**
 * Unique identifier for a node within a program
 */
export type NodeId = string;

/**
 * Program category/kind for organization and filtering
 */
export type NarrativeProgramKind =
  | 'dialogue' // General conversation
  | 'scene' // Authored scene with beats
  | 'quest_arc' // Quest or story arc
  | 'intimacy_scene' // Romantic/intimate scene
  | 'behavior_script' // NPC autonomous behavior
  | 'tutorial' // Tutorial or onboarding
  | 'mini_game'; // Interactive mini-game dialogue

/**
 * Content rating for the program
 */
export type ContentRating = 'general' | 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

// ============================================================================
// Condition System
// ============================================================================

/**
 * Condition expression for branching logic
 *
 * Supports:
 * - Comparisons: ==, !=, <, <=, >, >=
 * - Logical: &&, ||
 * - Variable paths: affinity, trust, flags.hasMetBefore, arcs.main.stage
 * - BETWEEN operator: affinity BETWEEN 60 AND 80
 */
export interface ConditionExpression {
  /** Expression string (e.g., "affinity >= 60 && trust > 50") */
  expression: string;

  /** Human-readable description (optional) */
  description?: string;
}

/**
 * State effects that can be applied when nodes execute or edges are traversed
 */
export interface StateEffects {
  /** Relationship metric deltas */
  relationship?: {
    affinity?: number;
    trust?: number;
    chemistry?: number;
    tension?: number;
  };

  /** Flag changes */
  flags?: {
    set?: Record<string, any>;
    delete?: string[];
    increment?: Record<string, number>;
  };

  /** Arc stage updates */
  arcs?: Record<string, string>; // arc_id -> new_stage

  /** Quest updates */
  quests?: Record<string, 'active' | 'completed' | 'failed'>;

  /** Inventory changes */
  inventory?: {
    add?: Array<{ itemId: string; quantity?: number }>;
    remove?: Array<{ itemId: string; quantity?: number }>;
  };

  /** Events to trigger or end */
  events?: {
    trigger?: string[];
    end?: string[];
  };

  /** ECS component updates (advanced) */
  components?: Record<string, any>;
}

// ============================================================================
// Node Types
// ============================================================================

/**
 * Base interface for all narrative nodes
 */
export interface NarrativeNodeBase {
  /** Unique node ID within this program */
  id: NodeId;

  /** Node type discriminator */
  type: string;

  /** Human-readable label for editors */
  label?: string;

  /** Effects applied when entering this node */
  onEnter?: StateEffects;

  /** Effects applied when exiting this node */
  onExit?: StateEffects;

  /** Visual metadata for graph editors */
  meta?: {
    position?: { x: number; y: number };
    color?: string;
    collapsed?: boolean;
    [key: string]: any;
  };
}

/**
 * Dialogue node - renders text or executes prompt program to generate dialogue
 */
export interface DialogueNode extends NarrativeNodeBase {
  type: 'dialogue';

  /** Dialogue mode */
  mode: 'static' | 'template' | 'llm_program';

  /** Static text (for mode: 'static') */
  text?: string;

  /** Template with variable substitution (for mode: 'template') */
  template?: string;

  /** Prompt program ID to execute (for mode: 'llm_program') */
  programId?: string;

  /** Speaker role (optional, for scene dialogue) */
  speaker?: 'npc' | 'player' | string;

  /** Emotion/expression hint */
  emotion?: string;

  /** Should this dialogue auto-advance or wait for player acknowledgment? */
  autoAdvance?: boolean;

  /** Delay before auto-advance (ms, if autoAdvance: true) */
  advanceDelay?: number;
}

/**
 * Choice node - presents player with options
 */
export interface ChoiceNode extends NarrativeNodeBase {
  type: 'choice';

  /** Prompt text shown above choices */
  prompt?: string;

  /** Choice options */
  choices: Array<{
    /** Unique choice ID */
    id: string;

    /** Display text */
    text: string;

    /** Condition for choice to be available */
    condition?: ConditionExpression;

    /** Target node ID when selected */
    targetNodeId: NodeId;

    /** Effects applied when selected */
    effects?: StateEffects;

    /** Visual hints (icon, color, etc.) */
    hints?: {
      icon?: string;
      color?: string;
      requiredItem?: string;
    };
  }>;

  /** Default choice if no conditions match */
  defaultChoiceId?: string;

  /** Should choices be shuffled? */
  shuffleChoices?: boolean;

  /** Timeout for choice (ms, optional) */
  timeout?: {
    duration: number;
    defaultChoiceId: string;
  };
}

/**
 * Action node - applies state effects without rendering
 */
export interface ActionNode extends NarrativeNodeBase {
  type: 'action';

  /** Description of what this action does */
  description: string;

  /** State effects to apply */
  effects: StateEffects;

  /** Optional delay before advancing (ms) */
  delay?: number;
}

/**
 * Action block node - references action blocks for visual generation
 */
export interface ActionBlockNode extends NarrativeNodeBase {
  type: 'action_block';

  /** Selection mode */
  mode: 'direct' | 'query';

  /** Direct block IDs (for mode: 'direct') */
  blockIds?: string[];

  /** Query parameters (for mode: 'query') */
  query?: {
    location?: string;
    pose?: string;
    intimacy_level?: string;
    mood?: string;
    branch_intent?: string;
    requiredTags?: string[];
    excludeTags?: string[];
    maxDuration?: number;
  };

  /** Composition strategy for multiple blocks */
  composition?: 'sequential' | 'layered' | 'merged';

  /** Should generation launch immediately or be stored as pending? */
  launchMode?: 'immediate' | 'pending';

  /** Generation configuration (if launching) */
  generationConfig?: {
    provider?: string;
    socialContext?: Record<string, any>;
    onComplete?: {
      /** Node to advance to when generation completes */
      targetNodeId?: NodeId;
    };
  };
}

/**
 * Scene node - transitions to a different scene or sets scene intent
 */
export interface SceneNode extends NarrativeNodeBase {
  type: 'scene';

  /** Scene transition mode */
  mode: 'transition' | 'intent';

  /** Target scene ID (for mode: 'transition') */
  sceneId?: number;

  /** Target node ID within scene (optional) */
  nodeId?: number;

  /** Scene intent to set (for mode: 'intent') */
  intent?: string;

  /** Role bindings for scene (NPC assignments) */
  roleBindings?: Record<string, number>; // role -> npc_id

  /** Transition effects */
  transition?: {
    type?: 'fade' | 'cut' | 'wipe';
    duration?: number;
  };
}

/**
 * Branch node - conditional branching without player input
 */
export interface BranchNode extends NarrativeNodeBase {
  type: 'branch';

  /** Branches to evaluate in order */
  branches: Array<{
    /** Unique branch ID */
    id: string;

    /** Condition to evaluate */
    condition: ConditionExpression;

    /** Target node if condition matches */
    targetNodeId: NodeId;

    /** Effects to apply if taken */
    effects?: StateEffects;
  }>;

  /** Default target if no conditions match */
  defaultTargetNodeId?: NodeId;
}

/**
 * Wait node - pause execution for a duration or until condition
 */
export interface WaitNode extends NarrativeNodeBase {
  type: 'wait';

  /** Wait mode */
  mode: 'duration' | 'condition' | 'player_input';

  /** Duration to wait in ms (for mode: 'duration') */
  duration?: number;

  /** Condition to wait for (for mode: 'condition') */
  condition?: ConditionExpression;

  /** Polling interval for condition check (ms) */
  pollInterval?: number;

  /** Maximum wait time (ms, optional timeout) */
  maxWait?: number;
}

/**
 * External call node - call plugin or external system
 */
export interface ExternalCallNode extends NarrativeNodeBase {
  type: 'external_call';

  /** External system/plugin identifier */
  system: string;

  /** Function/method to call */
  method: string;

  /** Parameters to pass */
  parameters?: Record<string, any>;

  /** Should execution wait for result? */
  async?: boolean;

  /** Where to store result (flag path) */
  resultPath?: string;

  /** Timeout (ms) */
  timeout?: number;
}

/**
 * Comment node - documentation only, skipped during execution
 */
export interface CommentNode extends NarrativeNodeBase {
  type: 'comment';

  /** Comment text */
  comment: string;

  /** Comment color for visual grouping */
  color?: string;
}

/**
 * Union type of all narrative node types
 */
export type NarrativeNode =
  | DialogueNode
  | ChoiceNode
  | ActionNode
  | ActionBlockNode
  | SceneNode
  | BranchNode
  | WaitNode
  | ExternalCallNode
  | CommentNode;

// ============================================================================
// Edges
// ============================================================================

/**
 * Edge connecting nodes in the narrative graph
 */
export interface NarrativeEdge {
  /** Unique edge ID */
  id: string;

  /** Source node ID */
  from: NodeId;

  /** Target node ID */
  to: NodeId;

  /** Condition for edge to be traversable (optional) */
  condition?: ConditionExpression;

  /** Effects applied when edge is traversed */
  effects?: StateEffects;

  /** Edge label for visual display */
  label?: string;

  /** Edge color/style for visual display */
  style?: {
    color?: string;
    dashed?: boolean;
  };
}

// ============================================================================
// Narrative Program
// ============================================================================

/**
 * Complete narrative program definition
 */
export interface NarrativeProgram {
  /** Unique program ID */
  id: NarrativeProgramId;

  /** Program version for migration */
  version: string;

  /** Program kind/category */
  kind: NarrativeProgramKind;

  /** Display name */
  name: string;

  /** Description */
  description?: string;

  /** Nodes in the program */
  nodes: NarrativeNode[];

  /** Edges connecting nodes */
  edges: NarrativeEdge[];

  /** Entry node ID (where execution starts) */
  entryNodeId: NodeId;

  /** Exit node IDs (where execution can end) */
  exitNodeIds?: NodeId[];

  /** Program metadata */
  metadata: {
    /** Content rating */
    contentRating: ContentRating;

    /** Associated NPC IDs (if program is NPC-specific) */
    npcIds?: number[];

    /** Associated character roles */
    roles?: string[];

    /** Required relationship tier */
    requiredTier?: string;

    /** Required intimacy level */
    requiredIntimacyLevel?: string;

    /** Tags for discovery/filtering */
    tags?: string[];

    /** Author/creator */
    author?: string;

    /** Creation timestamp */
    createdAt?: string;

    /** Last modified timestamp */
    updatedAt?: string;

    /** Estimated duration (seconds, for planning) */
    estimatedDuration?: number;

    /** Custom metadata */
    [key: string]: any;
  };

  /** Input variables expected by this program */
  inputs?: {
    required?: string[];
    optional?: string[];
  };

  /** Output variables produced by this program */
  outputs?: {
    [key: string]: string; // variable name -> description
  };

  /** Program-level variables (constants, defaults) */
  variables?: Record<string, any>;
}

// ============================================================================
// Runtime State
// ============================================================================

/**
 * Runtime execution state for a narrative program instance
 *
 * Stored in ECS component: session.flags.npcs["npc:<id>"].components.narrative
 */
export interface NarrativeRuntimeState {
  /** Active program ID (null if no program running) */
  activeProgramId: NarrativeProgramId | null;

  /** Active node ID (null if no program running) */
  activeNodeId: NodeId | null;

  /** Call stack for nested programs (interrupts, sub-conversations) */
  stack: Array<{
    programId: NarrativeProgramId;
    nodeId: NodeId;
    /** Timestamp when pushed */
    pushedAt: number;
  }>;

  /** History of visited nodes (for replay, debugging, condition checks) */
  history: Array<{
    programId: NarrativeProgramId;
    nodeId: NodeId;
    timestamp: number;
    /** Choice ID if node was a choice */
    choiceId?: string;
    /** Edge ID traversed */
    edgeId?: string;
  }>;

  /** Program-instance variables (distinct from session flags) */
  variables: Record<string, any>;

  /** Timestamp of last step */
  lastStepAt?: number;

  /** Pause state */
  paused?: boolean;

  /** Error state */
  error?: {
    message: string;
    nodeId: NodeId;
    timestamp: number;
  };
}

/**
 * Result of executing a single narrative step
 */
export interface NarrativeStepResult {
  /** Updated runtime state */
  state: NarrativeRuntimeState;

  /** Display content (if any) */
  display?: {
    /** Type of display */
    type: 'dialogue' | 'choice' | 'action_block' | 'scene_transition';

    /** Display data */
    data: any;
  };

  /** Choices available (if current node is a choice) */
  choices?: Array<{
    id: string;
    text: string;
    available: boolean;
    hints?: any;
  }>;

  /** Generation launched (if action block node with immediate launch) */
  generation?: {
    generationId: number;
    status: 'pending' | 'queued';
  };

  /** Scene transition initiated */
  sceneTransition?: {
    sceneId: number;
    nodeId?: number;
  };

  /** Did the program finish? */
  finished: boolean;

  /** Effects applied during this step */
  appliedEffects?: StateEffects;

  /** Metadata about execution */
  meta?: {
    executionTime?: number; // ms
    nodesVisited?: number;
    edgesTraversed?: number;
  };
}

// ============================================================================
// API Types
// ============================================================================

/**
 * Request to start a narrative program
 */
export interface StartProgramRequest {
  npcId: number;
  programId: NarrativeProgramId;
  entryNodeId?: NodeId; // Optional override
  initialVariables?: Record<string, any>;
}

/**
 * Request to step through a narrative program
 */
export interface StepProgramRequest {
  npcId: number;
  input?: {
    /** Choice ID if responding to a choice node */
    choiceId?: string;
    /** Player text input if responding to dialogue */
    text?: string;
    /** Custom input data */
    data?: any;
  };
}

/**
 * Response from starting or stepping a program
 */
export interface NarrativeExecutionResponse {
  success: boolean;
  result?: NarrativeStepResult;
  error?: string;
}

// ============================================================================
// Validation & Utilities
// ============================================================================

/**
 * Validation error for narrative programs
 */
export interface ValidationError {
  path: string; // e.g., "nodes[3].choices[0].targetNodeId"
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}


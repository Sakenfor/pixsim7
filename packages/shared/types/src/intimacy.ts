/**
 * Intimacy Scene Composer & Relationship Progression Types
 *
 * Type definitions for designing intimate scenes and relationship progression arcs
 * in the visual editor. Integrates with existing generation pipeline and social context.
 *
 * @see docs/INTIMACY_AND_GENERATION.md - Intimacy-aware generation system
 * @see docs/RELATIONSHIPS_AND_ARCS.md - Relationship data model
 * @see claude-tasks/12-intimacy-scene-composer-and-progression-editor.md - Task roadmap
 */

import type { GenerationSocialContext, GenerationNodeConfig } from './generation';

// ============================================================================
// Relationship Gates & Thresholds
// ============================================================================

/**
 * A relationship gate defines requirements that must be met to unlock content
 * Can be based on relationship tier, intimacy level, or specific metrics
 */
export interface RelationshipGate {
  /** Unique identifier for this gate */
  id: string;

  /** Display name for the gate */
  name: string;

  /** Description of what this gate represents */
  description?: string;

  /** Required relationship tier (e.g., 'friend', 'close_friend', 'lover') */
  requiredTier?: string;

  /** Required intimacy level (e.g., 'light_flirt', 'intimate') */
  requiredIntimacyLevel?: string;

  /** Specific metric thresholds */
  metricRequirements?: {
    /** Minimum affinity value (0-100) */
    minAffinity?: number;
    /** Minimum trust value (0-100) */
    minTrust?: number;
    /** Minimum chemistry value (0-100) */
    minChemistry?: number;
    /** Minimum tension value (0-100) */
    minTension?: number;
  };

  /** Required session flags that must be true */
  requiredFlags?: string[];

  /** Blocked flags that must be false */
  blockedFlags?: string[];

  /** Custom validation logic (for future extensibility) */
  customValidation?: string;
}

/**
 * Result of checking if a gate is satisfied
 */
export interface GateCheckResult {
  /** Whether the gate is satisfied */
  satisfied: boolean;

  /** Reasons why the gate is not satisfied (if any) */
  missingRequirements?: string[];

  /** Current values vs required values (for debugging) */
  details?: {
    currentTier?: string;
    requiredTier?: string;
    currentIntimacy?: string;
    requiredIntimacy?: string;
    metricValues?: Record<string, number>;
    metricRequirements?: Record<string, number>;
  };
}

// ============================================================================
// Intimacy Scene Configuration
// ============================================================================

/**
 * Intimacy scene type - defines the nature of the intimate content
 */
export type IntimacySceneType =
  | 'flirt'           // Light flirting, romantic interest
  | 'date'            // Romantic date/outing
  | 'kiss'            // Kissing scene
  | 'intimate'        // Intimate/romantic scene (implied)
  | 'custom';         // Custom scene type

/**
 * Intimacy intensity level - controls how explicit the content is
 */
export type IntimacyIntensity =
  | 'subtle'          // Very light, barely romantic
  | 'light'           // Light romance/flirting
  | 'moderate'        // Clear romantic/intimate content
  | 'intense';        // Very intimate (within rating constraints)

/**
 * Configuration for an intimacy scene node
 * Extends generation node config with intimacy-specific settings
 */
export interface IntimacySceneConfig {
  /** Editor-facing ID */
  id?: string;

  /** Display name for the scene */
  name?: string;

  /** Optional description */
  description?: string;

  /** Type of intimacy scene */
  sceneType: IntimacySceneType;

  /** Intensity level of the scene */
  intensity: IntimacyIntensity;

  /** Target NPC(s) for this scene */
  targetIds: number[];

  /** Legacy alias for target NPC IDs (editor-only) */
  npcIds?: number[];

  /** Relationship gate(s) required to access this scene */
  gates: RelationshipGate[];

  /** Content rating for this scene */
  contentRating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

  /** Social context for generation (derived from gates and current relationship state) */
  socialContext?: GenerationSocialContext;

  /** Generation configuration for dynamic content */
  generationConfig?: GenerationNodeConfig;

  /** Pre-authored content to use if generation is disabled/fails */
  fallbackSceneId?: string;

  /** Whether to show warnings/confirmations before playing this scene */
  requiresConsent?: boolean;

  /** Tags for organizing scenes */
  tags?: string[];

  /** Mood hint for generation */
  mood?: string;

  /** Duration hint for generation (seconds) */
  duration?: number;

  /** Custom metadata */
  metadata?: Record<string, any>;
}

/**
 * Runtime state for an intimacy scene node
 */
export interface IntimacySceneState {
  /** Whether this scene is currently unlocked (gates satisfied) */
  isUnlocked: boolean;

  /** Results of gate checks */
  gateResults: Record<string, GateCheckResult>;

  /** Last time this scene was accessed */
  lastAccessedAt?: string;

  /** Number of times this scene has been played */
  playCount: number;

  /** Current social context (computed from live session data) */
  currentSocialContext?: GenerationSocialContext;
}

// ============================================================================
// Relationship Progression Arc
// ============================================================================

/**
 * A progression stage represents a milestone in a relationship
 */
export interface ProgressionStage {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Description of this stage */
  description?: string;

  /** Relationship tier associated with this stage */
  tier: string;

  /** Intimacy level associated with this stage */
  intimacyLevel?: string;

  /** Gate requirements to reach this stage */
  gate: RelationshipGate;

  /** Scenes/events available at this stage */
  availableScenes?: string[];

  /** Metric changes when entering this stage */
  onEnterEffects?: {
    affinityDelta?: number;
    trustDelta?: number;
    chemistryDelta?: number;
    tensionDelta?: number;
    setFlags?: string[];
    clearFlags?: string[];
  };

  /** Visual position in the progression timeline */
  timelinePosition?: {
    x: number;
    y: number;
  };
}

/**
 * A relationship progression arc defines the full journey of a relationship
 */
export interface RelationshipProgressionArc {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Description */
  description?: string;

  /** Target NPC for this arc */
  targetNpcId: number;

  /** Ordered list of progression stages */
  stages: ProgressionStage[];

  /** Branching paths (for different relationship types) */
  branches?: {
    id: string;
    name: string;
    condition: string; // Expression to evaluate
    stages: ProgressionStage[];
  }[];

  /** Maximum content rating allowed in this arc */
  maxContentRating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

  /** Tags for organizing arcs */
  tags?: string[];

  /** Custom metadata */
  metadata?: Record<string, any>;
}

/**
 * Current state of a progression arc for a specific session/player
 */
export interface ProgressionArcState {
  /** Arc ID */
  arcId: string;

  /** NPC ID */
  npcId: number;

  /** Current stage ID */
  currentStageId: string;

  /** Completed stage IDs */
  completedStages: string[];

  /** Unlocked but not yet completed stages */
  unlockedStages: string[];

  /** Current branch (if applicable) */
  currentBranch?: string;

  /** Progress tracking */
  progress: {
    /** Overall completion percentage */
    completionPercent: number;

    /** Current relationship tier */
    currentTier: string;

    /** Current intimacy level */
    currentIntimacyLevel?: string;

    /** Current metric values */
    metrics: {
      affinity: number;
      trust: number;
      chemistry: number;
      tension: number;
    };
  };

  /** Timeline of events */
  history?: {
    timestamp: string;
    stageId: string;
    eventType: 'stage_entered' | 'stage_completed' | 'scene_played';
    details?: Record<string, any>;
  }[];
}

// ============================================================================
// Progression Visualization
// ============================================================================

/**
 * Visual representation of a progression timeline
 */
export interface ProgressionTimelineView {
  /** Arc being visualized */
  arc: RelationshipProgressionArc;

  /** Current state */
  state?: ProgressionArcState;

  /** Display options */
  options: {
    /** Show locked/future stages */
    showLocked: boolean;

    /** Show metric requirements */
    showRequirements: boolean;

    /** Show available scenes */
    showScenes: boolean;

    /** Layout mode */
    layout: 'horizontal' | 'vertical' | 'tree';

    /** Highlight current stage */
    highlightCurrent: boolean;
  };
}

// ============================================================================
// Validation & Safety
// ============================================================================

/**
 * Validation result for intimacy content
 */
export interface IntimacyContentValidation {
  /** Whether the content passes validation */
  valid: boolean;

  /** Validation errors (block save) */
  errors: string[];

  /** Validation warnings (allow save with notice) */
  warnings: string[];

  /** Safety checks */
  safety: {
    /** Whether content rating is within world limits */
    withinWorldLimits: boolean;

    /** Whether content rating is within user preferences */
    withinUserPreferences: boolean;

    /** Whether consent requirements are configured */
    consentConfigured: boolean;

    /** Whether gates are properly configured */
    gatesValid: boolean;
  };
}

/**
 * Content rating constraint check
 */
export interface ContentRatingCheck {
  /** Requested content rating */
  requested: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

  /** World maximum rating */
  worldMax?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

  /** User maximum rating */
  userMax?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

  /** Final allowed rating (most restrictive) */
  allowed: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

  /** Whether the requested rating is allowed */
  isAllowed: boolean;

  /** Reason if not allowed */
  reason?: string;
}

// ============================================================================
// Editor State
// ============================================================================

/**
 * State for the intimacy scene composer editor
 */
export interface IntimacyComposerEditorState {
  /** Currently selected scene config */
  selectedScene?: IntimacySceneConfig;

  /** Currently selected progression arc */
  selectedArc?: RelationshipProgressionArc;

  /** Preview mode settings */
  preview: {
    /** Whether preview is active */
    active: boolean;

    /** Simulated relationship state for preview */
    simulatedState?: {
      tier: string;
      intimacyLevel: string;
      metrics: Record<string, number>;
      flags: Record<string, boolean>;
    };

    /** Live social context preview */
    socialContext?: GenerationSocialContext;
  };

  /** Validation state */
  validation?: IntimacyContentValidation;

  /** UI state */
  ui: {
    /** Selected tab in the editor */
    activeTab: 'scene' | 'gates' | 'progression' | 'preview' | 'validation';

    /** Whether the gate visualizer is expanded */
    gateVisualizerExpanded: boolean;

    /** Whether the timeline is visible */
    timelineVisible: boolean;
  };
}

// ============================================================================
// Preset Templates
// ============================================================================

/**
 * Preset template for common intimacy scene patterns
 */
export interface IntimacySceneTemplate {
  /** Template ID */
  id: string;

  /** Display name */
  name: string;

  /** Description */
  description: string;

  /** Template configuration */
  config: Partial<IntimacySceneConfig>;

  /** Preview image */
  previewImage?: string;

  /** Tags for filtering */
  tags: string[];

  /** Usage count (for popularity sorting) */
  usageCount?: number;
}

/**
 * Preset template for progression arcs
 */
export interface ProgressionArcTemplate {
  /** Template ID */
  id: string;

  /** Display name */
  name: string;

  /** Description */
  description: string;

  /** Template configuration */
  config: Partial<RelationshipProgressionArc>;

  /** Preview image */
  previewImage?: string;

  /** Tags for filtering */
  tags: string[];

  /** Usage count (for popularity sorting) */
  usageCount?: number;
}

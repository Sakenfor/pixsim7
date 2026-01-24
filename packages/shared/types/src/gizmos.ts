/**
 * Generic Surface Interaction System Types
 *
 * This module defines a domain-agnostic gizmo/tool system that can support
 * any interactive surface domain (romance, massage, pet care, botanical, etc.).
 *
 * Key Concepts:
 * - SurfaceRegion: A zone on the surface with properties (replaces NpcBodyZone)
 * - SurfaceInstrument: A tool that interacts with regions (replaces InteractiveTool)
 * - SurfaceDimension: A measurable stat/metric (replaces StatType)
 * - SurfaceProfile: Complete configuration bundle for a domain
 *
 * Vocabulary Mapping from Legacy:
 * - NpcBodyZone → SurfaceRegion
 * - InteractiveTool → SurfaceInstrument
 * - StatType → SurfaceDimension
 * - BodyMapGizmo → GenericSurfaceGizmo (component)
 */

// =============================================================================
// Region Geometry (Coordinates)
// =============================================================================

export type RegionCoords =
  | { type: 'rect'; x: number; y: number; width: number; height: number }
  | { type: 'circle'; cx: number; cy: number; radius: number }
  | { type: 'polygon'; points: Array<{ x: number; y: number }> };

// =============================================================================
// Surface Region (Generic Zone)
// =============================================================================

/**
 * A region on an interactive surface.
 *
 * Properties are profile-defined (generic key-value pairs) rather than
 * hardcoded fields like sensitivity/ticklishness/pleasure.
 *
 * Example properties by domain:
 * - Romance: { sensitivity: 0.8, pleasure: 0.7, ticklishness: 0.3 }
 * - Massage: { tension: 0.6, pressure_tolerance: 0.8 }
 * - Botanical: { hydration: 0.4, dust: 0.2, nutrients: 0.5 }
 */
export interface SurfaceRegion {
  /** Unique region ID (e.g., "lips", "upper_back", "leaves") */
  id: string;

  /** Display label (e.g., "Lips", "Upper Back", "Leaves") */
  label: string;

  /** Visual shape type */
  shape: 'rect' | 'circle' | 'polygon';

  /** Coordinates (percentage-based 0-100 relative to viewBox) */
  coords: RegionCoords;

  /**
   * Generic properties for this region.
   * Keys and meanings are profile-specific.
   * Values are typically 0-1 normalized floats.
   */
  properties: Record<string, number>;

  /**
   * Instrument-specific effectiveness modifiers.
   * Example: { feather: 2.5, hot_stones: 1.5 }
   */
  instrumentModifiers?: Record<string, number>;

  /** Highlight color when region is hovered/active */
  highlightColor?: string;

  /** Hover effect style */
  hoverEffect?: 'glow' | 'pulse' | 'outline';

  /** Custom CSS class for styling */
  customClass?: string;

  /** Optional grouping (e.g., "head", "torso", "limbs") */
  group?: string;

  /** Sort order within group */
  order?: number;
}

// =============================================================================
// Surface Instrument (Generic Tool)
// =============================================================================

/** Particle effect configuration */
export interface InstrumentParticleEffect {
  type: string; // e.g., 'hearts', 'sparks', 'droplets', 'steam', 'petals'
  density: number; // 0-1
  color?: string;
  size?: number;
  lifetime?: number; // ms
}

/** Haptic feedback configuration */
export interface HapticConfig {
  type: 'pulse' | 'vibrate' | 'wave' | 'heartbeat' | 'tickle' | 'thump';
  intensity: number; // 0-1
  duration: number; // ms
  frequency?: number; // Hz
}

/**
 * An instrument for interacting with surface regions.
 *
 * Category and model are registry-driven strings rather than hardcoded enums.
 */
export interface SurfaceInstrument {
  /** Unique instrument ID (e.g., "touch", "feather", "watering_can") */
  id: string;

  /**
   * Instrument category (registry-defined).
   * Examples: 'manual', 'sensation', 'temperature', 'liquid', 'thermal'
   */
  category: string;

  /** Visual configuration */
  visual: {
    /** Model identifier (registry-driven) */
    model: string;
    /** Base color when inactive */
    baseColor: string;
    /** Color when active/pressed */
    activeColor: string;
    /** Enable glow effect */
    glow?: boolean;
    /** Enable trail effect */
    trail?: boolean;
    /** Particle effects */
    particles?: InstrumentParticleEffect;
    /** Distortion effect (heat shimmer, water ripple) */
    distortion?: boolean;
    /** Icon for UI */
    icon?: string;
  };

  /** Physics/behavior configuration */
  physics: {
    /** Base pressure (0-1) */
    pressure: number;
    /** Base speed (0-1) */
    speed: number;
    /** Temperature (0=cold, 0.5=neutral, 1=hot) */
    temperature?: number;
    /** Touch pattern */
    pattern?: string; // 'circular', 'linear', 'tap', 'hold', etc.
    /** Vibration intensity (0-1) */
    vibration?: number;
    /** For liquids: viscosity (0-1) */
    viscosity?: number;
    /** For objects: elasticity (0-1) */
    elasticity?: number;
    /** Additional physics properties */
    [key: string]: unknown;
  };

  /** Feedback configuration */
  feedback?: {
    /** Haptic feedback pattern */
    haptic?: HapticConfig;
    /** Audio feedback sound ID */
    audio?: string;
    /** NPC reaction type hint */
    reaction?: string;
    /** Impact effect */
    impact?: {
      type: 'squish' | 'bounce' | 'splash' | 'ripple';
      intensity: number;
      ripples?: boolean;
    };
  };

  /** Usage constraints */
  constraints?: {
    /** Minimum pressure required */
    minPressure?: number;
    /** Maximum speed allowed */
    maxSpeed?: number;
    /** Only usable on these region IDs */
    allowedRegions?: string[];
    /** Cooldown between uses (ms) */
    cooldown?: number;
  };

  /** Display name */
  label?: string;

  /** Description */
  description?: string;
}

// =============================================================================
// Surface Dimension (Generic Stat)
// =============================================================================

/**
 * A measurable dimension/stat that instruments affect.
 *
 * Examples:
 * - Romance: pleasure, tickle, arousal, intimacy
 * - Massage: relaxation, tension_release, comfort
 * - Botanical: hydration, health, growth
 */
export interface SurfaceDimension {
  /** Unique dimension ID (e.g., "pleasure", "relaxation", "hydration") */
  id: string;

  /** Display name (e.g., "Pleasure", "Relaxation", "Hydration") */
  name: string;

  /** Description */
  description?: string;

  /** Display color (hex) */
  color: string;

  /** Display icon (emoji or icon ID) */
  icon: string;

  /** Minimum value (default: 0) */
  minValue: number;

  /** Maximum value (default: 1) */
  maxValue: number;

  /** Decay rate per second when not actively affected */
  decayRate: number;

  /** Initial value (default: 0) */
  initialValue?: number;

  /**
   * Named thresholds for feedback reactions.
   * Example: { low: 0.2, medium: 0.5, high: 0.8, peak: 0.95 }
   */
  thresholds?: Record<string, number>;

  /** Whether this dimension is visible in UI */
  visible?: boolean;

  /** Whether this dimension affects completion criteria */
  affectsCompletion?: boolean;
}

// =============================================================================
// Dimension Contribution
// =============================================================================

/**
 * Defines how an instrument affects a dimension.
 */
export interface DimensionContribution {
  /** Target dimension ID */
  dimension: string;

  /** Base amount contributed per interaction tick (0-1 scale) */
  baseAmount: number;

  /** How contribution scales with pressure (0=none, 1=linear) */
  pressureScale?: number;

  /** How contribution scales with speed (0=none, 1=linear) */
  speedScale?: number;

  /**
   * How region properties scale the contribution.
   * Key is property name, value is scale factor.
   * Example: { sensitivity: 1.5, pleasure: 1.2 }
   */
  regionPropertyScale?: Record<string, number>;

  /** Override decay rate for this contribution */
  decayRateOverride?: number;
}

// =============================================================================
// Completion Criteria
// =============================================================================

/** Single completion condition */
export interface CompletionCondition {
  /** Type of condition */
  type: 'dimension_threshold' | 'all_dimensions' | 'time_elapsed' | 'custom';

  /** For dimension_threshold: dimension ID */
  dimensionId?: string;

  /** For dimension_threshold: minimum value required */
  minValue?: number;

  /** For all_dimensions: minimum average value */
  averageMin?: number;

  /** For time_elapsed: seconds required */
  seconds?: number;

  /** For custom: custom condition ID */
  customId?: string;

  /** Label shown to user */
  label?: string;
}

/**
 * Criteria for completing a gizmo session.
 */
export interface CompletionCriteria {
  /** Conditions that must all be met (AND) */
  allOf?: CompletionCondition[];

  /** Conditions where at least one must be met (OR) */
  anyOf?: CompletionCondition[];

  /** Time limit in seconds (session fails if exceeded) */
  timeLimit?: number;

  /** Allow manual completion button */
  allowManualCompletion?: boolean;

  /** Minimum session duration before completion allowed */
  minDuration?: number;
}

// =============================================================================
// Outcome Mapping
// =============================================================================

/**
 * Maps gizmo session results to interaction outcomes.
 * Used when gizmo is part of an interaction surface.
 */
export interface OutcomeMapping {
  /**
   * Dimension → interaction stat mappings.
   * Example: { pleasure: { statPackage: 'relationships', axis: 'affinity', scale: 0.1 } }
   */
  dimensionToStat?: Record<string, {
    statPackage: string;
    definitionId?: string;
    axis: string;
    scale: number;
  }>;

  /**
   * Completion type → outcome ID mappings.
   * Example: { success: 'outcome:massage_complete', timeout: 'outcome:massage_timeout' }
   */
  completionOutcomes?: Record<string, string>;

  /** Flags to set on completion */
  flagsOnCompletion?: Record<string, unknown>;

  /** Custom outcome handler ID */
  customOutcomeId?: string;
}

// =============================================================================
// Visual Configuration
// =============================================================================

/** Configuration for surface rendering */
export interface SurfaceVisualConfig {
  /** Background image URL for the surface */
  surfaceImage?: string;

  /**
   * SVG viewBox dimensions [width, height].
   * Regions use percentage coordinates relative to this.
   */
  viewBox?: [number, number];

  /** Background color (fallback) */
  backgroundColor?: string;

  /** Render mode */
  renderMode?: 'svg' | 'canvas' | 'webgl';

  /** Show region labels */
  showRegionLabels?: boolean;

  /** Show dimension bars */
  showDimensionBars?: boolean;

  /** Animation settings */
  animations?: {
    hoverScale?: number;
    transitionDuration?: number;
    particleIntensity?: number;
  };
}

// =============================================================================
// Surface Profile (Complete Bundle)
// =============================================================================

/**
 * Complete configuration bundle for a surface interaction domain.
 *
 * Profiles are registered in the profile registry and referenced by ID.
 * Interactions can specify which profile to use via gizmoConfig.profileId.
 */
export interface SurfaceProfile {
  /** Unique profile ID (e.g., "humanoid-romance", "back-massage", "plant-care") */
  id: string;

  /** Display name (e.g., "Romantic Touch", "Back Massage", "Plant Care") */
  name: string;

  /** Domain category (e.g., "romance", "massage", "botanical") */
  domain: string;

  /** Description */
  description?: string;

  /** All regions for this surface */
  regions: SurfaceRegion[];

  /** All available instruments */
  instruments: SurfaceInstrument[];

  /** All trackable dimensions */
  dimensions: SurfaceDimension[];

  /**
   * How instruments contribute to dimensions.
   * Key is instrument ID, value is array of contributions.
   */
  contributions: Record<string, DimensionContribution[]>;

  /** Visual rendering configuration */
  visualConfig: SurfaceVisualConfig;

  /** Session completion criteria */
  completionCriteria?: CompletionCriteria;

  /** Mapping to interaction outcomes */
  outcomeMapping?: OutcomeMapping;

  /** Tags for filtering/categorization */
  tags?: string[];

  /** Version for profile updates */
  version?: number;

  /** Designer metadata */
  meta?: Record<string, unknown>;
}

// =============================================================================
// Gizmo Session Types
// =============================================================================

/** Current values for all dimensions */
export interface DimensionValues {
  [dimensionId: string]: number;
}

/** Snapshot of a gizmo session state */
export interface GizmoSessionState {
  /** Profile being used */
  profileId: string;

  /** Current dimension values */
  dimensions: DimensionValues;

  /** Currently selected instrument ID */
  activeInstrumentId?: string;

  /** Currently hovered/active region ID */
  activeRegionId?: string;

  /** Session start timestamp */
  startedAt: number;

  /** Session duration in seconds */
  duration: number;

  /** Whether session is paused */
  isPaused: boolean;

  /** Whether completion criteria met */
  isComplete: boolean;

  /** Completion type (if complete) */
  completionType?: 'success' | 'timeout' | 'manual' | 'cancelled';
}

/** Result of a completed gizmo session */
export interface GizmoSessionResult {
  /** Final dimension values */
  finalDimensions: DimensionValues;

  /** How the session ended */
  completionType: 'success' | 'timeout' | 'manual' | 'cancelled';

  /** Total session duration in seconds */
  sessionDuration: number;

  /** Peak values reached for each dimension */
  peakValues?: DimensionValues;

  /** Instruments used and their usage counts */
  instrumentUsage?: Record<string, number>;

  /** Regions interacted with and their touch counts */
  regionInteractions?: Record<string, number>;
}

// =============================================================================
// Gizmo Configuration (for Interactions)
// =============================================================================

/**
 * Configuration for a gizmo-based interaction.
 * Stored in InteractionDefinition.gizmoConfig
 */
export interface GizmoConfig {
  /** Profile ID to load */
  profileId: string;

  /** Override time limit (seconds) */
  timeLimit?: number;

  /** Override instruments (subset of profile instruments) */
  instrumentIds?: string[];

  /** Override regions (subset of profile regions) */
  regionIds?: string[];

  /** Override dimensions (subset of profile dimensions) */
  dimensionIds?: string[];

  /** Initial dimension values (0-1) */
  initialDimensions?: DimensionValues;

  /** Override completion criteria */
  completionOverrides?: Partial<CompletionCriteria>;

  /** Custom data for the gizmo */
  customData?: Record<string, unknown>;
}

/**
 * NPC Interactive Zones System
 *
 * Defines body regions/zones where tools have different effectiveness.
 * Uses static zone definitions per video segment (no real-time tracking needed).
 */

// ============================================================================
// Zone Geometry Types
// ============================================================================

export type ZoneCoords =
  | { type: 'rect'; x: number; y: number; width: number; height: number }
  | { type: 'circle'; cx: number; cy: number; radius: number }
  | { type: 'polygon'; points: Array<{ x: number; y: number }> };

// ============================================================================
// Zone Definition
// ============================================================================

/**
 * Interactive zone on NPC body
 * Coordinates are percentage-based (0-100) relative to video dimensions
 */
export interface NpcBodyZone {
  /** Unique zone ID (e.g., "left_foot", "back", "arms") */
  id: string;

  /** Display name (e.g., "Left Foot") */
  label: string;

  /** Visual representation shape */
  shape: 'rect' | 'circle' | 'polygon';

  /** Coordinates (percentage-based, 0-100) */
  coords: ZoneCoords;

  // ===== Zone Properties =====

  /** How sensitive this zone is to touch (0.0-1.0) */
  sensitivity: number;

  /** Ticklishness level (0.0-1.0, optional) */
  ticklishness?: number;

  /** Pleasure sensitivity (0.0-1.0, optional) */
  pleasure?: number;

  // ===== Tool Effectiveness =====

  /**
   * Tool-specific effectiveness modifiers
   * Example: { feather: 2.0, brush: 1.5 }
   * Multiplies the base tool effectiveness
   */
  toolModifiers?: {
    [toolId: string]: number;
  };

  // ===== Visual Feedback =====

  /** Highlight color when zone is hovered */
  highlightColor?: string;

  /** Hover effect style */
  hoverEffect?: 'glow' | 'pulse' | 'outline';

  /** Custom CSS class for styling */
  customClass?: string;
}

// ============================================================================
// Video Segment Zones
// ============================================================================

/**
 * Zone configuration for a specific video segment
 */
export interface VideoSegmentZones {
  /** Which video segment these zones apply to */
  segmentId: string;

  /** Active zones in this segment */
  zones: NpcBodyZone[];

  /**
   * Optional: Timestamp-based zones for segments with movement
   * Allows zones to change position during a single segment
   */
  timelineZones?: {
    /** Seconds into segment when these zones become active */
    timestamp: number;
    /** Zones active at this timestamp */
    zones: NpcBodyZone[];
  }[];
}

/**
 * Zone template (reusable zone definitions)
 */
export interface ZoneTemplate {
  id: string;
  name: string;
  description?: string;
  zones: NpcBodyZone[];
}

// ============================================================================
// Zone Response Modifiers
// ============================================================================

/**
 * Modifiers that affect NPC response based on zone
 */
export interface ZoneResponseModifier {
  /** Multiply pleasure calculation */
  pleasureMultiplier?: number;

  /** Multiply tickle calculation */
  tickleMultiplier?: number;

  /** Override expression (e.g., always giggle when feet are tickled) */
  expressionOverride?: string;

  /** Override emotion */
  emotionOverride?: string;

  /** Override animation */
  animationOverride?: string;

  /** Add to intensity */
  intensityBonus?: number;
}

// ============================================================================
// Zone Interaction Event
// ============================================================================

/**
 * Extended tool interaction event with zone context
 */
export interface ZoneInteractionContext {
  /** Which zone was interacted with */
  zoneId: string;

  /** Zone sensitivity (0.0-1.0) */
  sensitivity: number;

  /** Tool effectiveness multiplier in this zone */
  effectivenessMultiplier: number;

  /** Ticklishness level (if applicable) */
  ticklishness?: number;

  /** Pleasure level (if applicable) */
  pleasure?: number;
}

// ============================================================================
// Zone Configuration (in NPC Metadata)
// ============================================================================

/**
 * Zone configuration in NPC Response Metadata
 */
export interface NpcZoneConfiguration {
  /** Zone definitions per video segment */
  segments: VideoSegmentZones[];

  /** Global zone templates (reusable across segments) */
  templates?: {
    [templateId: string]: NpcBodyZone[];
  };

  /** Zone-specific response modifiers */
  zoneResponseModifiers?: {
    [zoneId: string]: ZoneResponseModifier;
  };

  /** Default zone (when clicking outside defined zones) */
  defaultZone?: {
    id: string;
    sensitivity: number;
  };
}

// ============================================================================
// Utility Functions (Types)
// ============================================================================

/**
 * Function to check if a point is inside a zone
 */
export type PointInZoneFn = (
  x: number,
  y: number,
  zone: NpcBodyZone
) => boolean;

/**
 * Function to calculate effective intensity with zone modifiers
 */
export type CalculateEffectiveIntensityFn = (
  baseIntensity: number,
  zone: NpcBodyZone,
  toolId: string,
  zoneModifiers?: ZoneResponseModifier
) => number;

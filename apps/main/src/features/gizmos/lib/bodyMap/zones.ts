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

// ============================================================================
// Zone Presets
// ============================================================================

/**
 * Anatomical zone preset with ~20 zones including intimate areas.
 * Coordinates are percentage-based (0-100) mapped to a 100x120 viewBox.
 *
 * Body layout:
 * - Head: y 0-18
 * - Neck/Shoulders: y 18-28
 * - Torso: y 28-58
 * - Hips/Groin: y 58-75
 * - Legs: y 75-115
 * - Arms: x 15-32 (left), x 68-85 (right)
 */
export const ANATOMICAL_ZONES: NpcBodyZone[] = [
  // ===== Head & Face =====
  {
    id: 'head',
    label: 'Head',
    shape: 'circle',
    coords: { type: 'circle', cx: 50, cy: 8, radius: 7 },
    sensitivity: 0.5,
    ticklishness: 0.2,
    highlightColor: '#A78BFA',
  },
  {
    id: 'ears',
    label: 'Ears',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 42, y: 5 }, { x: 44, y: 3 }, { x: 44, y: 10 }, { x: 42, y: 12 },
      ],
    },
    sensitivity: 0.75,
    ticklishness: 0.5,
    pleasure: 0.6,
    highlightColor: '#F472B6',
  },
  {
    id: 'lips',
    label: 'Lips',
    shape: 'rect',
    coords: { type: 'rect', x: 47, y: 10, width: 6, height: 3 },
    sensitivity: 0.9,
    pleasure: 0.85,
    highlightColor: '#FB7185',
  },

  // ===== Neck & Shoulders =====
  {
    id: 'neck',
    label: 'Neck',
    shape: 'rect',
    coords: { type: 'rect', x: 45, y: 16, width: 10, height: 6 },
    sensitivity: 0.85,
    ticklishness: 0.5,
    pleasure: 0.75,
    highlightColor: '#F9A8D4',
  },
  {
    id: 'shoulders',
    label: 'Shoulders',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 32, y: 22 }, { x: 68, y: 22 },
        { x: 65, y: 28 }, { x: 35, y: 28 },
      ],
    },
    sensitivity: 0.5,
    highlightColor: '#93C5FD',
  },

  // ===== Torso =====
  {
    id: 'chest',
    label: 'Chest',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 35, y: 28 }, { x: 65, y: 28 },
        { x: 66, y: 40 }, { x: 34, y: 40 },
      ],
    },
    sensitivity: 0.7,
    pleasure: 0.6,
    highlightColor: '#FDA4AF',
  },
  {
    id: 'nipples',
    label: 'Nipples',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 38, y: 32 }, { x: 62, y: 32 },
        { x: 62, y: 38 }, { x: 38, y: 38 },
      ],
    },
    sensitivity: 0.95,
    pleasure: 0.9,
    highlightColor: '#FB7185',
  },
  {
    id: 'stomach',
    label: 'Stomach',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 36, y: 40 }, { x: 64, y: 40 },
        { x: 62, y: 55 }, { x: 38, y: 55 },
      ],
    },
    sensitivity: 0.6,
    ticklishness: 0.8,
    highlightColor: '#FCD34D',
  },
  {
    id: 'lower_back',
    label: 'Lower Back',
    shape: 'rect',
    coords: { type: 'rect', x: 40, y: 48, width: 20, height: 10 },
    sensitivity: 0.7,
    pleasure: 0.6,
    highlightColor: '#C4B5FD',
  },

  // ===== Intimate Areas =====
  {
    id: 'hips',
    label: 'Hips',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 35, y: 55 }, { x: 65, y: 55 },
        { x: 68, y: 65 }, { x: 32, y: 65 },
      ],
    },
    sensitivity: 0.8,
    pleasure: 0.7,
    highlightColor: '#F9A8D4',
  },
  {
    id: 'groin',
    label: 'Groin',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 42, y: 62 }, { x: 58, y: 62 },
        { x: 55, y: 72 }, { x: 45, y: 72 },
      ],
    },
    sensitivity: 0.95,
    pleasure: 0.95,
    highlightColor: '#F43F5E',
  },
  {
    id: 'buttocks',
    label: 'Buttocks',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 35, y: 60 }, { x: 65, y: 60 },
        { x: 62, y: 72 }, { x: 38, y: 72 },
      ],
    },
    sensitivity: 0.85,
    pleasure: 0.8,
    highlightColor: '#FB923C',
  },
  {
    id: 'inner_thighs',
    label: 'Inner Thighs',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 42, y: 72 }, { x: 48, y: 72 },
        { x: 46, y: 88 }, { x: 44, y: 88 },
      ],
    },
    sensitivity: 0.9,
    pleasure: 0.85,
    ticklishness: 0.7,
    highlightColor: '#F472B6',
  },

  // ===== Arms & Hands =====
  {
    id: 'upper_arms',
    label: 'Upper Arms',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 25, y: 26 }, { x: 32, y: 26 },
        { x: 30, y: 45 }, { x: 22, y: 45 },
      ],
    },
    sensitivity: 0.4,
    highlightColor: '#86EFAC',
  },
  {
    id: 'forearms',
    label: 'Forearms',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 22, y: 45 }, { x: 30, y: 45 },
        { x: 26, y: 62 }, { x: 18, y: 62 },
      ],
    },
    sensitivity: 0.45,
    ticklishness: 0.4,
    highlightColor: '#6EE7B7',
  },
  {
    id: 'wrists',
    label: 'Wrists',
    shape: 'rect',
    coords: { type: 'rect', x: 17, y: 60, width: 10, height: 6 },
    sensitivity: 0.75,
    pleasure: 0.5,
    highlightColor: '#A78BFA',
  },
  {
    id: 'hands',
    label: 'Hands',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 16, y: 66 }, { x: 26, y: 66 },
        { x: 24, y: 76 }, { x: 14, y: 76 },
      ],
    },
    sensitivity: 0.7,
    ticklishness: 0.6,
    highlightColor: '#C4B5FD',
  },

  // ===== Legs & Feet =====
  {
    id: 'thighs',
    label: 'Thighs',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 36, y: 72 }, { x: 44, y: 72 },
        { x: 42, y: 92 }, { x: 34, y: 92 },
      ],
    },
    sensitivity: 0.55,
    ticklishness: 0.5,
    highlightColor: '#7DD3FC',
  },
  {
    id: 'calves',
    label: 'Calves',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 35, y: 92 }, { x: 42, y: 92 },
        { x: 40, y: 108 }, { x: 36, y: 108 },
      ],
    },
    sensitivity: 0.5,
    ticklishness: 0.45,
    highlightColor: '#67E8F9',
  },
  {
    id: 'feet',
    label: 'Feet',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 34, y: 108 }, { x: 44, y: 108 },
        { x: 46, y: 115 }, { x: 32, y: 115 },
      ],
    },
    sensitivity: 0.8,
    ticklishness: 0.95,
    pleasure: 0.4,
    highlightColor: '#FCD34D',
    toolModifiers: {
      feather: 2.5,
      touch: 1.2,
    },
  },
];

/**
 * Mirror zones for right side of body (arms/legs).
 * Call this to generate symmetric zones from left-side definitions.
 */
export function mirrorZonesHorizontal(zones: NpcBodyZone[]): NpcBodyZone[] {
  const mirrored: NpcBodyZone[] = [];

  for (const zone of zones) {
    // Skip zones that don't need mirroring (centered zones)
    if (!zone.id.includes('left') && !['upper_arms', 'forearms', 'wrists', 'hands', 'thighs', 'calves', 'feet', 'inner_thighs'].includes(zone.id)) {
      continue;
    }

    const mirroredZone: NpcBodyZone = {
      ...zone,
      id: zone.id.replace('left', 'right').replace(/^(upper_arms|forearms|wrists|hands|thighs|calves|feet|inner_thighs)$/, 'right_$1'),
      label: zone.label.replace('Left', 'Right'),
    };

    // Mirror coordinates horizontally around x=50
    if (mirroredZone.coords.type === 'rect') {
      mirroredZone.coords = {
        ...mirroredZone.coords,
        x: 100 - mirroredZone.coords.x - mirroredZone.coords.width,
      };
    } else if (mirroredZone.coords.type === 'circle') {
      mirroredZone.coords = {
        ...mirroredZone.coords,
        cx: 100 - mirroredZone.coords.cx,
      };
    } else if (mirroredZone.coords.type === 'polygon') {
      mirroredZone.coords = {
        type: 'polygon',
        points: mirroredZone.coords.points.map(p => ({ x: 100 - p.x, y: p.y })),
      };
    }

    mirrored.push(mirroredZone);
  }

  return mirrored;
}

/**
 * Get full anatomical zones with both sides mirrored.
 */
export function getFullAnatomicalZones(): NpcBodyZone[] {
  const rightSide = mirrorZonesHorizontal(ANATOMICAL_ZONES);
  return [...ANATOMICAL_ZONES, ...rightSide];
}

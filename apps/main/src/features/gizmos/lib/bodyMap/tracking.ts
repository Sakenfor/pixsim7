/**
 * NPC Zone Tracking & Persistence System
 *
 * Allows defining zones once on a reference frame and tracking them across
 * video segments. Supports manual correspondence, template matching, keypoint
 * tracking, and ML pose estimation.
 */

import type { NpcBodyZone, ZoneCoords } from './zones';

// ============================================================================
// Reference Frame
// ============================================================================

/**
 * Reference frame where zones are initially defined
 */
export interface ZoneReferenceFrame {
  /** Segment ID used as reference */
  referenceSegmentId: string;

  /** Frame timestamp within segment (seconds, optional) */
  referenceTimestamp?: number;

  /** Optional: Reference image URL for visual tracking */
  referenceImageUrl?: string;

  /** Zones defined on this reference frame */
  zones: NpcBodyZone[];

  /** When this reference was created */
  createdAt: string;

  /** Metadata */
  metadata?: {
    createdBy?: string;
    notes?: string;
    version?: number;
  };
}

// ============================================================================
// Tracking Methods
// ============================================================================

/**
 * Method used to track zones across segments
 */
export type ZoneTrackingMethod =
  | 'manual'           // Manually defined for each segment
  | 'template'         // Visual template matching
  | 'keypoint'         // Keypoint-based tracking
  | 'correspondence'   // Manual correspondence mapping
  | 'pose'             // ML pose estimation (MediaPipe, OpenPose, etc.)
  | 'interpolation';   // Interpolated between keyframes

// ============================================================================
// Visual Template (for template matching)
// ============================================================================

/**
 * Visual template extracted from reference frame
 */
export interface ZoneVisualTemplate {
  /** Zone ID this template belongs to */
  zoneId: string;

  /** Template image data */
  template: {
    /** Image data (base64, blob URL, or file path) */
    imageData: string;

    /** Template dimensions (pixels) */
    width: number;
    height: number;

    /** Original position in reference frame (percentage) */
    origin: { x: number; y: number };

    /** Format of image data */
    format: 'base64' | 'blob' | 'url';
  };

  /** Template matching parameters */
  matching: {
    /** Search radius around expected position (percentage) */
    searchRadius: number;

    /** Similarity threshold (0-1) */
    threshold: number;

    /** Scale tolerance */
    scaleRange: { min: number; max: number };

    /** Rotation tolerance (degrees) */
    rotationTolerance?: number;
  };
}

/**
 * Template matching result
 */
export interface TemplateMatchResult {
  /** Whether a match was found */
  found: boolean;

  /** Match confidence (0-1) */
  confidence: number;

  /** Matched position (percentage) */
  position?: { x: number; y: number };

  /** Matched scale (relative to original) */
  scale?: number;

  /** Matched rotation (degrees) */
  rotation?: number;

  /** Match quality metrics */
  metrics?: {
    /** Template similarity score (0-1) */
    similarity: number;
    /** Coverage of template in match (0-1) */
    coverage: number;
  };
}

// ============================================================================
// Keypoint Tracking
// ============================================================================

/**
 * Keypoint definition for zone tracking
 */
export interface ZoneKeypoint {
  /** Keypoint identifier */
  id: string;

  /** Label for this keypoint */
  label?: string;

  /** Position in reference frame (percentage) */
  x: number;
  y: number;

  /** Importance weight (0-1) */
  weight?: number;
}

/**
 * Tracked keypoint in target segment
 */
export interface TrackedKeypoint {
  /** Original keypoint ID */
  id: string;

  /** Tracked position (percentage) */
  x: number;
  y: number;

  /** Tracking confidence (0-1) */
  confidence: number;
}

// ============================================================================
// Zone Tracking Result
// ============================================================================

/**
 * Tracking result for a zone in a specific segment
 */
export interface ZoneTrackingResult {
  /** Zone ID from reference frame */
  zoneId: string;

  /** Segment where this zone was tracked */
  segmentId: string;

  /** Tracked coordinates */
  coords: ZoneCoords;

  /** Tracking method used */
  method: ZoneTrackingMethod;

  /** Confidence score (0-1) */
  confidence: number;

  /** Whether this was manually corrected/adjusted */
  manuallyAdjusted?: boolean;

  /** Visual template data (for template matching) */
  template?: ZoneVisualTemplate;

  /** Keypoint data (for keypoint tracking) */
  keypoints?: TrackedKeypoint[];

  /** ML pose data (for pose estimation) */
  poseData?: {
    /** Pose landmarks detected */
    landmarks?: Record<string, { x: number; y: number; z?: number }>;
    /** Pose confidence */
    confidence?: number;
  };

  /** When this tracking was performed */
  trackedAt?: string;

  /** Notes or warnings */
  notes?: string;
}

// ============================================================================
// Zone Correspondence Mapping
// ============================================================================

/**
 * Manual correspondence between reference zone and segment zone
 */
export interface ZoneCorrespondence {
  /** Zone ID from reference frame */
  referenceZoneId: string;

  /** Segment ID */
  segmentId: string;

  /** Corresponding coordinates in this segment */
  coords: ZoneCoords;

  /** Optional: Timestamp within segment (seconds) */
  timestamp?: number;

  /** Optional: Notes about this correspondence */
  notes?: string;

  /** When this correspondence was created */
  createdAt?: string;
}

/**
 * Complete correspondence map for all zones across segments
 */
export interface ZoneCorrespondenceMap {
  /** Reference frame info */
  reference: {
    segmentId: string;
    timestamp?: number;
  };

  /** All correspondences */
  correspondences: ZoneCorrespondence[];

  /** Interpolation settings */
  interpolation?: {
    /** Whether to interpolate zones for segments between keyframes */
    enabled: boolean;

    /** Interpolation method */
    method: 'linear' | 'ease' | 'cubic' | 'bezier';

    /** Interpolate between these keyframe segments */
    keyframes?: string[];
  };
}

// ============================================================================
// Complete Zone Tracking Data
// ============================================================================

/**
 * Complete tracking data for an NPC's zones
 */
export interface NpcZoneTrackingData {
  /** NPC identifier (game_npcs.id) */
  npcId: number;

  /** Reference frame where zones were initially defined */
  reference: ZoneReferenceFrame;

  /** Tracked zones per segment */
  trackedZones: {
    [segmentId: string]: ZoneTrackingResult[];
  };

  /** Visual templates (if using template matching) */
  templates?: {
    [zoneId: string]: ZoneVisualTemplate;
  };

  /** Correspondence map (if using manual correspondence) */
  correspondenceMap?: ZoneCorrespondenceMap;

  /** Tracking settings */
  settings: {
    /** Automatically track zones in new segments */
    autoTrack: boolean;

    /** Minimum confidence for auto-tracking (0-1) */
    minConfidence: number;

    /** Preferred tracking method */
    preferredMethod: ZoneTrackingMethod;

    /** Fallback method if preferred fails */
    fallbackMethod?: ZoneTrackingMethod;
  };

  /** Persistence metadata */
  metadata: {
    /** Version of tracking data format */
    version: number;

    /** Last update timestamp */
    lastUpdated: string;

    /** Total number of segments tracked */
    totalSegments: number;

    /** Average confidence across all tracked zones */
    averageConfidence?: number;
  };
}

// ============================================================================
// Persisted Format (JSON Storage)
// ============================================================================

/**
 * Persisted zone tracking data format (for JSON storage)
 */
export interface PersistedZoneTrackingData {
  /** Format version */
  version: '1.0.0';

  /** NPC identifier (game_npcs.id) */
  npcId: number;

  /** Reference frame */
  reference: ZoneReferenceFrame;

  /** Tracked zones indexed by segment */
  segments: {
    [segmentId: string]: {
      zones: ZoneTrackingResult[];
      lastUpdated: string;
    };
  };

  /** Visual templates */
  templates?: {
    [zoneId: string]: ZoneVisualTemplate;
  };

  /** Correspondence map */
  correspondenceMap?: ZoneCorrespondenceMap;

  /** Settings */
  settings: {
    autoTrack: boolean;
    preferredMethod: ZoneTrackingMethod;
    minConfidence: number;
    fallbackMethod?: ZoneTrackingMethod;
  };

  /** Metadata */
  metadata: {
    createdAt: string;
    lastUpdated: string;
    totalSegments: number;
    averageConfidence?: number;
  };
}

// ============================================================================
// Zone Tracking Operations
// ============================================================================

/**
 * Request to track zones in a specific segment
 */
export interface TrackZonesRequest {
  /** NPC ID (game_npcs.id) */
  npcId: number;

  /** Target segment ID */
  targetSegmentId: string;

  /** Tracking method to use */
  method: ZoneTrackingMethod;

  /** Optional: Override settings for this request */
  settings?: {
    minConfidence?: number;
    searchRadius?: number;
    threshold?: number;
  };

  /** Optional: Reference image URL for target segment */
  targetImageUrl?: string;
}

/**
 * Response from zone tracking operation
 */
export interface TrackZonesResponse {
  /** Whether tracking was successful */
  success: boolean;

  /** Tracked zones */
  zones: ZoneTrackingResult[];

  /** Errors or warnings */
  messages?: string[];

  /** Tracking statistics */
  stats?: {
    totalZones: number;
    trackedSuccessfully: number;
    averageConfidence: number;
    failedZones: string[];
  };
}

// ============================================================================
// Zone Validation
// ============================================================================

/**
 * Validation result for zone tracking data
 */
export interface ZoneTrackingValidationResult {
  /** Whether the tracking data is valid */
  valid: boolean;

  /** Errors found */
  errors: {
    /** Error type */
    type: 'missing_reference' | 'missing_segments' | 'low_confidence' | 'invalid_coords';
    /** Error message */
    message: string;
    /** Affected zone ID */
    zoneId?: string;
    /** Affected segment ID */
    segmentId?: string;
  }[];

  /** Warnings */
  warnings: {
    /** Warning type */
    type: 'low_confidence' | 'manual_adjustment' | 'old_data';
    /** Warning message */
    message: string;
    /** Affected zone ID */
    zoneId?: string;
    /** Affected segment ID */
    segmentId?: string;
  }[];

  /** Statistics */
  stats: {
    totalZones: number;
    totalSegments: number;
    averageConfidence: number;
    lowConfidenceCount: number;
    manualAdjustmentCount: number;
  };
}

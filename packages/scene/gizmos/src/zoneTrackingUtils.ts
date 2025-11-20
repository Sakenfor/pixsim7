/**
 * Zone Tracking Utility Functions
 * Helpers for tracking zones across video segments and persisting tracking data
 */

import type {
  NpcZoneTrackingData,
  ZoneReferenceFrame,
  ZoneTrackingResult,
  ZoneCorrespondence,
  ZoneCorrespondenceMap,
  PersistedZoneTrackingData,
  ZoneTrackingValidationResult,
  NpcBodyZone,
} from '@pixsim7/shared.types';

// ============================================================================
// Zone Tracking Data Generation
// ============================================================================

/**
 * Generate zones for all segments from manual correspondences
 */
export function generateZonesFromCorrespondences(
  reference: ZoneReferenceFrame,
  correspondences: ZoneCorrespondence[]
): NpcZoneTrackingData {
  // Group correspondences by segment
  const bySegment = new Map<string, ZoneCorrespondence[]>();

  for (const corr of correspondences) {
    if (!bySegment.has(corr.segmentId)) {
      bySegment.set(corr.segmentId, []);
    }
    bySegment.get(corr.segmentId)!.push(corr);
  }

  // Build tracked zones
  const trackedZones: { [segmentId: string]: ZoneTrackingResult[] } = {};

  // Add reference segment
  trackedZones[reference.referenceSegmentId] = reference.zones.map((zone) => ({
    zoneId: zone.id,
    segmentId: reference.referenceSegmentId,
    coords: zone.coords,
    method: 'manual' as const,
    confidence: 1.0,
    trackedAt: new Date().toISOString(),
  }));

  // Add corresponding segments
  for (const [segmentId, corrs] of bySegment) {
    trackedZones[segmentId] = corrs.map((corr) => ({
      zoneId: corr.referenceZoneId,
      segmentId: corr.segmentId,
      coords: corr.coords,
      method: 'correspondence' as const,
      confidence: 1.0,
      trackedAt: corr.createdAt || new Date().toISOString(),
      notes: corr.notes,
    }));
  }

  return {
    npcId: '',  // To be set by caller
    reference,
    trackedZones,
    correspondenceMap: {
      reference: {
        segmentId: reference.referenceSegmentId,
        timestamp: reference.referenceTimestamp,
      },
      correspondences,
    },
    settings: {
      autoTrack: false,
      minConfidence: 0.7,
      preferredMethod: 'correspondence',
    },
    metadata: {
      version: 1,
      lastUpdated: new Date().toISOString(),
      totalSegments: Object.keys(trackedZones).length,
    },
  };
}

/**
 * Get tracked zones for a specific segment
 */
export function getTrackedZonesForSegment(
  trackingData: NpcZoneTrackingData,
  segmentId: string
): NpcBodyZone[] {
  const tracked = trackingData.trackedZones[segmentId];
  if (!tracked) return [];

  // Convert ZoneTrackingResult to NpcBodyZone
  return tracked.map((result) => {
    // Find original zone from reference to get full properties
    const refZone = trackingData.reference.zones.find((z) => z.id === result.zoneId);
    if (!refZone) {
      throw new Error(`Reference zone not found: ${result.zoneId}`);
    }

    // Merge reference zone properties with tracked coords
    return {
      ...refZone,
      coords: result.coords,
    };
  });
}

/**
 * Add or update tracked zone for a segment
 */
export function updateTrackedZone(
  trackingData: NpcZoneTrackingData,
  segmentId: string,
  zoneResult: ZoneTrackingResult
): NpcZoneTrackingData {
  const existing = trackingData.trackedZones[segmentId] || [];

  // Remove existing tracking for this zone (if any)
  const filtered = existing.filter((z) => z.zoneId !== zoneResult.zoneId);

  // Add new tracking
  filtered.push(zoneResult);

  return {
    ...trackingData,
    trackedZones: {
      ...trackingData.trackedZones,
      [segmentId]: filtered,
    },
    metadata: {
      ...trackingData.metadata,
      lastUpdated: new Date().toISOString(),
      totalSegments: Object.keys({
        ...trackingData.trackedZones,
        [segmentId]: filtered,
      }).length,
    },
  };
}

/**
 * Remove tracked zone from a segment
 */
export function removeTrackedZone(
  trackingData: NpcZoneTrackingData,
  segmentId: string,
  zoneId: string
): NpcZoneTrackingData {
  const existing = trackingData.trackedZones[segmentId];
  if (!existing) return trackingData;

  const filtered = existing.filter((z) => z.zoneId !== zoneId);

  return {
    ...trackingData,
    trackedZones: {
      ...trackingData.trackedZones,
      [segmentId]: filtered,
    },
    metadata: {
      ...trackingData.metadata,
      lastUpdated: new Date().toISOString(),
    },
  };
}

// ============================================================================
// Persistence (Save/Load)
// ============================================================================

/**
 * Convert NpcZoneTrackingData to persisted format
 */
export function toPersistedFormat(
  trackingData: NpcZoneTrackingData
): PersistedZoneTrackingData {
  // Convert trackedZones map to segments format
  const segments: PersistedZoneTrackingData['segments'] = {};

  for (const [segmentId, zones] of Object.entries(trackingData.trackedZones)) {
    segments[segmentId] = {
      zones,
      lastUpdated: new Date().toISOString(),
    };
  }

  return {
    version: '1.0.0',
    npcId: trackingData.npcId,
    reference: trackingData.reference,
    segments,
    templates: trackingData.templates,
    correspondenceMap: trackingData.correspondenceMap,
    settings: trackingData.settings,
    metadata: {
      createdAt: trackingData.reference.createdAt,
      lastUpdated: trackingData.metadata.lastUpdated,
      totalSegments: trackingData.metadata.totalSegments,
      averageConfidence: trackingData.metadata.averageConfidence,
    },
  };
}

/**
 * Convert persisted format to NpcZoneTrackingData
 */
export function fromPersistedFormat(
  persisted: PersistedZoneTrackingData
): NpcZoneTrackingData {
  // Convert segments format back to trackedZones map
  const trackedZones: NpcZoneTrackingData['trackedZones'] = {};

  for (const [segmentId, segmentData] of Object.entries(persisted.segments)) {
    trackedZones[segmentId] = segmentData.zones;
  }

  return {
    npcId: persisted.npcId,
    reference: persisted.reference,
    trackedZones,
    templates: persisted.templates,
    correspondenceMap: persisted.correspondenceMap,
    settings: persisted.settings,
    metadata: {
      version: 1,
      lastUpdated: persisted.metadata.lastUpdated,
      totalSegments: persisted.metadata.totalSegments,
      averageConfidence: persisted.metadata.averageConfidence,
    },
  };
}

/**
 * Save zone tracking data to JSON
 */
export async function saveZoneTrackingJSON(
  trackingData: NpcZoneTrackingData,
  filepath: string
): Promise<void> {
  const persisted = toPersistedFormat(trackingData);
  const json = JSON.stringify(persisted, null, 2);

  // In browser: download as file
  if (typeof window !== 'undefined') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filepath;
    a.click();
    URL.revokeObjectURL(url);
  }
  // In Node.js: write to file
  else if (typeof require !== 'undefined') {
    const fs = require('fs').promises;
    await fs.writeFile(filepath, json, 'utf-8');
  }
}

/**
 * Load zone tracking data from JSON
 */
export async function loadZoneTrackingJSON(
  filepath: string
): Promise<NpcZoneTrackingData> {
  let json: string;

  // In Node.js: read from file
  if (typeof require !== 'undefined') {
    const fs = require('fs').promises;
    json = await fs.readFile(filepath, 'utf-8');
  } else {
    throw new Error('loadZoneTrackingJSON only works in Node.js environment');
  }

  const persisted: PersistedZoneTrackingData = JSON.parse(json);
  return fromPersistedFormat(persisted);
}

/**
 * Load zone tracking data from URL
 */
export async function loadZoneTrackingURL(
  url: string
): Promise<NpcZoneTrackingData> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load zone tracking: ${response.statusText}`);
  }

  const persisted: PersistedZoneTrackingData = await response.json();
  return fromPersistedFormat(persisted);
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate zone tracking data
 */
export function validateZoneTracking(
  trackingData: NpcZoneTrackingData
): ZoneTrackingValidationResult {
  const errors: ZoneTrackingValidationResult['errors'] = [];
  const warnings: ZoneTrackingValidationResult['warnings'] = [];

  // Check reference frame
  if (!trackingData.reference || !trackingData.reference.zones.length) {
    errors.push({
      type: 'missing_reference',
      message: 'Reference frame has no zones defined',
    });
  }

  // Check segments
  if (Object.keys(trackingData.trackedZones).length === 0) {
    errors.push({
      type: 'missing_segments',
      message: 'No segments have been tracked',
    });
  }

  // Check confidence scores
  let totalConfidence = 0;
  let lowConfidenceCount = 0;
  let manualAdjustmentCount = 0;
  let totalZones = 0;

  for (const [segmentId, zones] of Object.entries(trackingData.trackedZones)) {
    for (const zone of zones) {
      totalZones++;
      totalConfidence += zone.confidence;

      if (zone.confidence < trackingData.settings.minConfidence) {
        lowConfidenceCount++;
        warnings.push({
          type: 'low_confidence',
          message: `Zone "${zone.zoneId}" in segment "${segmentId}" has low confidence (${zone.confidence.toFixed(2)})`,
          zoneId: zone.zoneId,
          segmentId,
        });
      }

      if (zone.manuallyAdjusted) {
        manualAdjustmentCount++;
      }

      // Validate coordinates
      if (!isValidCoords(zone.coords)) {
        errors.push({
          type: 'invalid_coords',
          message: `Zone "${zone.zoneId}" in segment "${segmentId}" has invalid coordinates`,
          zoneId: zone.zoneId,
          segmentId,
        });
      }
    }
  }

  const averageConfidence = totalZones > 0 ? totalConfidence / totalZones : 0;

  // Check if data is old
  const lastUpdated = new Date(trackingData.metadata.lastUpdated);
  const daysSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceUpdate > 90) {
    warnings.push({
      type: 'old_data',
      message: `Tracking data is ${Math.floor(daysSinceUpdate)} days old`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalZones,
      totalSegments: Object.keys(trackingData.trackedZones).length,
      averageConfidence,
      lowConfidenceCount,
      manualAdjustmentCount,
    },
  };
}

/**
 * Check if coordinates are valid
 */
function isValidCoords(coords: any): boolean {
  if (coords.type === 'rect') {
    return (
      typeof coords.x === 'number' &&
      typeof coords.y === 'number' &&
      typeof coords.width === 'number' &&
      typeof coords.height === 'number' &&
      coords.x >= 0 && coords.x <= 100 &&
      coords.y >= 0 && coords.y <= 100 &&
      coords.width > 0 &&
      coords.height > 0
    );
  }

  if (coords.type === 'circle') {
    return (
      typeof coords.cx === 'number' &&
      typeof coords.cy === 'number' &&
      typeof coords.radius === 'number' &&
      coords.cx >= 0 && coords.cx <= 100 &&
      coords.cy >= 0 && coords.cy <= 100 &&
      coords.radius > 0
    );
  }

  if (coords.type === 'polygon') {
    return (
      Array.isArray(coords.points) &&
      coords.points.length >= 3 &&
      coords.points.every(
        (p: any) =>
          typeof p.x === 'number' &&
          typeof p.y === 'number' &&
          p.x >= 0 && p.x <= 100 &&
          p.y >= 0 && p.y <= 100
      )
    );
  }

  return false;
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get statistics for zone tracking data
 */
export function getZoneTrackingStats(trackingData: NpcZoneTrackingData): {
  totalSegments: number;
  totalZones: number;
  averageConfidence: number;
  methodDistribution: Record<string, number>;
  lowConfidenceZones: Array<{ segmentId: string; zoneId: string; confidence: number }>;
  unTrackedZones: Array<{ segmentId: string; zoneId: string }>;
} {
  let totalZones = 0;
  let totalConfidence = 0;
  const methodDistribution: Record<string, number> = {};
  const lowConfidenceZones: Array<{ segmentId: string; zoneId: string; confidence: number }> = [];

  for (const [segmentId, zones] of Object.entries(trackingData.trackedZones)) {
    for (const zone of zones) {
      totalZones++;
      totalConfidence += zone.confidence;

      // Count methods
      methodDistribution[zone.method] = (methodDistribution[zone.method] || 0) + 1;

      // Track low confidence
      if (zone.confidence < trackingData.settings.minConfidence) {
        lowConfidenceZones.push({
          segmentId,
          zoneId: zone.zoneId,
          confidence: zone.confidence,
        });
      }
    }
  }

  // Find untracked zones (zones in reference but not in some segments)
  const unTrackedZones: Array<{ segmentId: string; zoneId: string }> = [];
  const allSegments = Object.keys(trackingData.trackedZones);

  for (const refZone of trackingData.reference.zones) {
    for (const segmentId of allSegments) {
      const hasZone = trackingData.trackedZones[segmentId]?.some(
        (z) => z.zoneId === refZone.id
      );
      if (!hasZone) {
        unTrackedZones.push({ segmentId, zoneId: refZone.id });
      }
    }
  }

  return {
    totalSegments: Object.keys(trackingData.trackedZones).length,
    totalZones,
    averageConfidence: totalZones > 0 ? totalConfidence / totalZones : 0,
    methodDistribution,
    lowConfidenceZones,
    unTrackedZones,
  };
}

/**
 * Get tracking completeness (percentage of zones tracked across all segments)
 */
export function getTrackingCompleteness(trackingData: NpcZoneTrackingData): number {
  const totalExpected =
    trackingData.reference.zones.length *
    Object.keys(trackingData.trackedZones).length;

  if (totalExpected === 0) return 0;

  let totalTracked = 0;
  for (const zones of Object.values(trackingData.trackedZones)) {
    totalTracked += zones.length;
  }

  return (totalTracked / totalExpected) * 100;
}

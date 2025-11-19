/**
 * NPC Zone Utility Functions
 * Helper functions for working with interactive zones
 */

import type {
  NpcBodyZone,
  ZoneInteractionContext,
  VideoSegmentZones,
  ZoneResponseModifier,
} from '@pixsim7/types';

// ============================================================================
// Point-in-Zone Detection
// ============================================================================

/**
 * Check if a point (x, y) is inside a zone
 * Coordinates are percentage-based (0-100)
 */
export function isPointInZone(
  x: number,
  y: number,
  zone: NpcBodyZone
): boolean {
  if (zone.coords.type === 'rect') {
    return (
      x >= zone.coords.x &&
      x <= zone.coords.x + zone.coords.width &&
      y >= zone.coords.y &&
      y <= zone.coords.y + zone.coords.height
    );
  }

  if (zone.coords.type === 'circle') {
    const dx = x - zone.coords.cx;
    const dy = y - zone.coords.cy;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= zone.coords.radius;
  }

  if (zone.coords.type === 'polygon') {
    // Ray casting algorithm for point-in-polygon
    const points = zone.coords.points;
    let inside = false;

    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x;
      const yi = points[i].y;
      const xj = points[j].x;
      const yj = points[j].y;

      const intersect =
        yi > y !== yj > y &&
        x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

      if (intersect) {
        inside = !inside;
      }
    }

    return inside;
  }

  return false;
}

/**
 * Find zone at given point
 */
export function findZoneAtPoint(
  x: number,
  y: number,
  zones: NpcBodyZone[]
): NpcBodyZone | null {
  // Check zones in reverse order (last defined = highest priority)
  for (let i = zones.length - 1; i >= 0; i--) {
    if (isPointInZone(x, y, zones[i])) {
      return zones[i];
    }
  }
  return null;
}

// ============================================================================
// Zone Queries
// ============================================================================

/**
 * Get zones for a specific video segment
 */
export function getZonesForSegment(
  segmentId: string,
  segmentZones: VideoSegmentZones[]
): NpcBodyZone[] {
  const segment = segmentZones.find((s) => s.segmentId === segmentId);
  return segment?.zones || [];
}

/**
 * Get zones at a specific timestamp within a segment
 * (for segments with timeline-based zone changes)
 */
export function getZonesAtTimestamp(
  segmentId: string,
  timestamp: number,
  segmentZones: VideoSegmentZones[]
): NpcBodyZone[] {
  const segment = segmentZones.find((s) => s.segmentId === segmentId);
  if (!segment) return [];

  // If no timeline zones, return base zones
  if (!segment.timelineZones || segment.timelineZones.length === 0) {
    return segment.zones;
  }

  // Find the most recent timeline entry before this timestamp
  let activeTimelineZones = segment.zones;

  for (const timelineEntry of segment.timelineZones) {
    if (timelineEntry.timestamp <= timestamp) {
      activeTimelineZones = timelineEntry.zones;
    } else {
      break;
    }
  }

  return activeTimelineZones;
}

/**
 * Get zone by ID
 */
export function getZoneById(
  zoneId: string,
  zones: NpcBodyZone[]
): NpcBodyZone | null {
  return zones.find((z) => z.id === zoneId) || null;
}

// ============================================================================
// Effectiveness Calculations
// ============================================================================

/**
 * Calculate effective intensity with zone modifiers
 */
export function calculateEffectiveIntensity(
  baseIntensity: number,
  zone: NpcBodyZone,
  toolId: string,
  zoneModifier?: ZoneResponseModifier
): number {
  let intensity = baseIntensity;

  // Apply zone sensitivity
  intensity *= zone.sensitivity;

  // Apply tool-specific modifier
  const toolModifier = zone.toolModifiers?.[toolId] || 1.0;
  intensity *= toolModifier;

  // Apply zone response modifier intensity bonus
  if (zoneModifier?.intensityBonus) {
    intensity += zoneModifier.intensityBonus;
  }

  // Clamp to 0-1
  return Math.max(0, Math.min(1, intensity));
}

/**
 * Build zone interaction context
 */
export function buildZoneContext(
  zone: NpcBodyZone,
  toolId: string,
  zoneModifier?: ZoneResponseModifier
): ZoneInteractionContext {
  const effectivenessMultiplier = zone.toolModifiers?.[toolId] || 1.0;

  return {
    zoneId: zone.id,
    sensitivity: zone.sensitivity,
    effectivenessMultiplier,
    ticklishness: zone.ticklishness,
    pleasure: zone.pleasure,
  };
}

// ============================================================================
// Zone Visualization Helpers
// ============================================================================

/**
 * Get CSS for zone shape
 */
export function getZoneShapeCSS(
  zone: NpcBodyZone,
  isHovered: boolean,
  opacity: number = 0.2
): React.CSSProperties {
  const baseOpacity = isHovered ? opacity * 2 : opacity;
  const color = zone.highlightColor || '#4dabf7';

  const commonStyles: React.CSSProperties = {
    position: 'absolute',
    backgroundColor: color,
    opacity: baseOpacity,
    border: isHovered ? `2px solid ${color}` : 'none',
    transition: 'opacity 0.2s, border 0.2s',
    pointerEvents: 'none',
  };

  if (zone.coords.type === 'rect') {
    return {
      ...commonStyles,
      left: `${zone.coords.x}%`,
      top: `${zone.coords.y}%`,
      width: `${zone.coords.width}%`,
      height: `${zone.coords.height}%`,
      borderRadius: '4px',
    };
  }

  if (zone.coords.type === 'circle') {
    return {
      ...commonStyles,
      left: `${zone.coords.cx - zone.coords.radius}%`,
      top: `${zone.coords.cy - zone.coords.radius}%`,
      width: `${zone.coords.radius * 2}%`,
      height: `${zone.coords.radius * 2}%`,
      borderRadius: '50%',
    };
  }

  // Polygon uses SVG, return basic styles
  return commonStyles;
}

/**
 * Get zone effectiveness description
 */
export function getZoneEffectivenessDescription(
  zone: NpcBodyZone,
  toolId: string
): string {
  const modifier = zone.toolModifiers?.[toolId];

  if (!modifier || modifier === 1.0) {
    return zone.label;
  }

  if (modifier > 1.5) {
    return `${zone.label} - Very effective! (${modifier.toFixed(1)}x)`;
  } else if (modifier > 1.0) {
    return `${zone.label} - Effective (${modifier.toFixed(1)}x)`;
  } else {
    return `${zone.label} - Less effective (${modifier.toFixed(1)}x)`;
  }
}

/**
 * Get zone color based on effectiveness
 */
export function getZoneColorByEffectiveness(
  zone: NpcBodyZone,
  toolId: string
): string {
  if (zone.highlightColor) {
    return zone.highlightColor;
  }

  const modifier = zone.toolModifiers?.[toolId] || 1.0;

  if (modifier > 1.5) {
    return '#ff6b6b'; // High effectiveness - red
  } else if (modifier > 1.0) {
    return '#ffd43b'; // Medium effectiveness - yellow
  } else if (modifier < 1.0) {
    return '#868e96'; // Low effectiveness - gray
  } else {
    return '#4dabf7'; // Normal - blue
  }
}

// ============================================================================
// Zone Validation
// ============================================================================

/**
 * Validate zone definition
 */
export function validateZone(zone: NpcBodyZone): string[] {
  const errors: string[] = [];

  if (!zone.id) {
    errors.push('Zone must have an ID');
  }

  if (!zone.label) {
    errors.push('Zone must have a label');
  }

  if (zone.sensitivity < 0 || zone.sensitivity > 1) {
    errors.push('Zone sensitivity must be between 0 and 1');
  }

  if (zone.ticklishness !== undefined && (zone.ticklishness < 0 || zone.ticklishness > 1)) {
    errors.push('Zone ticklishness must be between 0 and 1');
  }

  if (zone.pleasure !== undefined && (zone.pleasure < 0 || zone.pleasure > 1)) {
    errors.push('Zone pleasure must be between 0 and 1');
  }

  // Validate coordinates
  if (zone.coords.type === 'rect') {
    const { x, y, width, height } = zone.coords;
    if (x < 0 || x > 100 || y < 0 || y > 100) {
      errors.push('Rectangle coordinates must be between 0-100');
    }
    if (width <= 0 || height <= 0) {
      errors.push('Rectangle dimensions must be positive');
    }
    if (x + width > 100 || y + height > 100) {
      errors.push('Rectangle extends beyond bounds (0-100)');
    }
  }

  if (zone.coords.type === 'circle') {
    const { cx, cy, radius } = zone.coords;
    if (cx < 0 || cx > 100 || cy < 0 || cy > 100) {
      errors.push('Circle center must be between 0-100');
    }
    if (radius <= 0) {
      errors.push('Circle radius must be positive');
    }
  }

  if (zone.coords.type === 'polygon') {
    if (zone.coords.points.length < 3) {
      errors.push('Polygon must have at least 3 points');
    }
    for (const point of zone.coords.points) {
      if (point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100) {
        errors.push('Polygon points must be between 0-100');
        break;
      }
    }
  }

  return errors;
}

/**
 * Validate all zones in a segment
 */
export function validateSegmentZones(segmentZones: VideoSegmentZones): {
  valid: boolean;
  errors: Record<string, string[]>;
} {
  const errors: Record<string, string[]> = {};

  for (const zone of segmentZones.zones) {
    const zoneErrors = validateZone(zone);
    if (zoneErrors.length > 0) {
      errors[zone.id] = zoneErrors;
    }
  }

  // Check for duplicate zone IDs
  const zoneIds = new Set<string>();
  for (const zone of segmentZones.zones) {
    if (zoneIds.has(zone.id)) {
      if (!errors[zone.id]) {
        errors[zone.id] = [];
      }
      errors[zone.id].push(`Duplicate zone ID: ${zone.id}`);
    }
    zoneIds.add(zone.id);
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Models Library
 *
 * Utilities for 3D model inspection, zone management, and animation handling.
 */

export {
  DEFAULT_ZONE_PROPERTIES,
  ZONE_COLORS,
  getZoneColor,
} from './types';
export type * from './types';

export {
  ZONE_PREFIX,
  createContactZone,
  parseModelForZones,
  isZoneMesh,
  extractZoneId,
  formatZoneLabel,
  findZoneMeshes,
  raycastForZone,
  createZoneHighlightMaterial,
  computeFramingPosition,
  createZoneMeshName,
} from './zoneUtils';

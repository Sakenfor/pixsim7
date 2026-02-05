/**
 * Geometry Init
 * Sets up window.PXS7Geometry for player modules.
 * This must be imported BEFORE any player modules.
 */

import {
  pointInPolygon,
  getBoundingBox,
  getPathRect,
  distance,
  simplifyPath,
  createMediaTransform,
  // Polygon editing
  findNearestVertex,
  findNearestEdge,
  polygonHitTest,
  moveVertex,
  movePolygon,
  insertVertexOnEdge,
  removeVertex,
  calculateVertexThreshold,
  // Region serialization
  validatePolygonPoints,
  normalizePolygonPoints,
  regionToJson,
  regionFromJson,
  serializeRegion,
  deserializeRegion,
  createPolygonRegion,
  pointsToCoordArray,
} from '@pixsim7/graphics.geometry';

// Set global immediately on module evaluation
window.PXS7Geometry = {
  pointInPolygon,
  getBoundingBox,
  getPathRect,
  distance,
  simplifyPath,
  createMediaTransform,
  // Polygon editing
  findNearestVertex,
  findNearestEdge,
  polygonHitTest,
  moveVertex,
  movePolygon,
  insertVertexOnEdge,
  removeVertex,
  calculateVertexThreshold,
  // Region serialization
  validatePolygonPoints,
  normalizePolygonPoints,
  regionToJson,
  regionFromJson,
  serializeRegion,
  deserializeRegion,
  createPolygonRegion,
  pointsToCoordArray,
};

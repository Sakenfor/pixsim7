/**
 * Zone Utilities
 *
 * Functions for extracting and managing contact zones from glTF models.
 */

import * as THREE from 'three';
import type {
  AnimationClipInfo,
  ContactZone3D,
  ModelParseResult,
  ZoneProperties,
  DEFAULT_ZONE_PROPERTIES,
  getZoneColor,
} from './types';

/** Prefix used to identify zone meshes by name */
export const ZONE_PREFIX = 'zone_';

/**
 * Check if a mesh name represents a zone.
 */
export function isZoneMesh(name: string): boolean {
  return name.toLowerCase().startsWith(ZONE_PREFIX);
}

/**
 * Extract the zone ID from a mesh name.
 * e.g., "zone_tip" -> "tip"
 */
export function extractZoneId(meshName: string): string {
  if (isZoneMesh(meshName)) {
    return meshName.slice(ZONE_PREFIX.length);
  }
  return meshName;
}

/**
 * Generate a mesh name from a zone ID.
 * e.g., "tip" -> "zone_tip"
 */
export function createZoneMeshName(zoneId: string): string {
  return `${ZONE_PREFIX}${zoneId}`;
}

/**
 * Parse a glTF scene to extract zones, animations, and bounding box.
 */
export function parseModelForZones(
  scene: THREE.Object3D,
  animations: THREE.AnimationClip[]
): ModelParseResult {
  const zoneIds: string[] = [];
  const zoneMeshMap: Record<string, string[]> = {};

  // Calculate bounding box
  const box = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  // Traverse scene to find zone meshes
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const name = object.name;

      // Check for zone_ prefix
      if (isZoneMesh(name)) {
        const zoneId = extractZoneId(name);
        if (!zoneIds.includes(zoneId)) {
          zoneIds.push(zoneId);
          zoneMeshMap[zoneId] = [];
        }
        zoneMeshMap[zoneId].push(name);
      }

      // Check userData for vertex groups (some exporters use this)
      const vertexGroups = object.userData?.vertexGroups;
      if (Array.isArray(vertexGroups)) {
        for (const group of vertexGroups) {
          const groupName = typeof group === 'string' ? group : group.name;
          if (groupName && !zoneIds.includes(groupName)) {
            zoneIds.push(groupName);
            zoneMeshMap[groupName] = [name];
          } else if (groupName && zoneMeshMap[groupName]) {
            if (!zoneMeshMap[groupName].includes(name)) {
              zoneMeshMap[groupName].push(name);
            }
          }
        }
      }
    }
  });

  // Parse animations
  const animationInfos: AnimationClipInfo[] = animations.map((clip) => ({
    name: clip.name,
    duration: clip.duration,
    trackCount: clip.tracks.length,
  }));

  return {
    zoneIds,
    zoneMeshMap,
    animations: animationInfos,
    boundingBox: {
      min: [box.min.x, box.min.y, box.min.z],
      max: [box.max.x, box.max.y, box.max.z],
      center: [center.x, center.y, center.z],
      size: [size.x, size.y, size.z],
    },
  };
}

/**
 * Create a contact zone from a zone ID with default properties.
 */
export function createContactZone(
  zoneId: string,
  meshNames: string[],
  index: number
): ContactZone3D {
  const { getZoneColor, DEFAULT_ZONE_PROPERTIES } = require('./types');

  return {
    id: zoneId,
    label: formatZoneLabel(zoneId),
    meshNames,
    properties: {
      ...DEFAULT_ZONE_PROPERTIES,
      highlightColor: getZoneColor(index),
    },
  };
}

/**
 * Format a zone ID into a human-readable label.
 * e.g., "tip_area" -> "Tip Area"
 */
export function formatZoneLabel(zoneId: string): string {
  return zoneId
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Find meshes in a scene that belong to a specific zone.
 */
export function findZoneMeshes(
  scene: THREE.Object3D,
  zoneId: string
): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const targetName = createZoneMeshName(zoneId).toLowerCase();

  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      if (object.name.toLowerCase() === targetName) {
        meshes.push(object);
      }
      // Also check userData for vertex group assignments
      const vertexGroups = object.userData?.vertexGroups;
      if (Array.isArray(vertexGroups)) {
        const hasZone = vertexGroups.some((group) => {
          const groupName = typeof group === 'string' ? group : group.name;
          return groupName === zoneId;
        });
        if (hasZone && !meshes.includes(object)) {
          meshes.push(object);
        }
      }
    }
  });

  return meshes;
}

/**
 * Create a highlight material for a zone.
 */
export function createZoneHighlightMaterial(
  color: string,
  opacity: number = 0.5
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * Perform a raycast to find which zone is under the mouse.
 */
export function raycastForZone(
  event: { clientX: number; clientY: number },
  camera: THREE.Camera,
  scene: THREE.Object3D,
  domElement: HTMLElement
): { zoneId: string; point: THREE.Vector3 } | null {
  const rect = domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObject(scene, true);

  for (const intersect of intersects) {
    if (intersect.object instanceof THREE.Mesh) {
      const name = intersect.object.name;

      // Check if it's a zone mesh
      if (isZoneMesh(name)) {
        return {
          zoneId: extractZoneId(name),
          point: intersect.point,
        };
      }

      // Check userData for vertex groups
      const vertexGroups = intersect.object.userData?.vertexGroups;
      if (Array.isArray(vertexGroups) && vertexGroups.length > 0) {
        const firstGroup = vertexGroups[0];
        const groupName = typeof firstGroup === 'string' ? firstGroup : firstGroup.name;
        if (groupName) {
          return {
            zoneId: groupName,
            point: intersect.point,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Compute optimal camera position to frame a model.
 */
export function computeFramingPosition(
  boundingBox: ModelParseResult['boundingBox'],
  cameraFov: number = 50
): { position: [number, number, number]; target: [number, number, number] } {
  const [cx, cy, cz] = boundingBox.center;
  const [sx, sy, sz] = boundingBox.size;

  // Calculate distance needed to frame the model
  const maxDim = Math.max(sx, sy, sz);
  const fovRad = (cameraFov * Math.PI) / 180;
  const distance = maxDim / (2 * Math.tan(fovRad / 2)) * 1.5;

  // Position camera at an angle for better 3D view
  const angle = Math.PI / 6; // 30 degrees
  const height = cy + distance * Math.sin(angle);
  const horizontalDist = distance * Math.cos(angle);

  return {
    position: [cx + horizontalDist * 0.7, height, cz + horizontalDist * 0.7],
    target: [cx, cy, cz],
  };
}

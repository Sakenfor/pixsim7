/**
 * ZoneHighlighter
 *
 * Renders visual overlays for contact zones in the 3D viewport.
 * Highlights selected and hovered zones with distinct colors.
 */

import { useThree } from '@react-three/fiber';
import { useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';

import { ZONE_PREFIX, createZoneHighlightMaterial } from '@lib/models/zoneUtils';

import { useModel3DStore } from '../stores/model3DStore';

/**
 * Interface for zone mesh data.
 */
interface ZoneMeshData {
  zoneId: string;
  mesh: THREE.Mesh;
  originalMaterial: THREE.Material | THREE.Material[];
}

/**
 * ZoneHighlighter component that overlays zone indicators on the model.
 */
export function ZoneHighlighter() {
  const { scene } = useThree();
  const [zoneMeshes, setZoneMeshes] = useState<ZoneMeshData[]>([]);

  const selectedZoneId = useModel3DStore((s) => s.selectedZoneId);
  const hoveredZoneId = useModel3DStore((s) => s.hoveredZoneId);
  const zoneConfigs = useModel3DStore((s) => s.zoneConfigs);
  const parseResult = useModel3DStore((s) => s.parseResult);

  // Find zone meshes in the scene
  useEffect(() => {
    const found: ZoneMeshData[] = [];

    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const name = object.name.toLowerCase();
        if (name.startsWith(ZONE_PREFIX)) {
          const zoneId = name.slice(ZONE_PREFIX.length);
          found.push({
            zoneId,
            mesh: object,
            originalMaterial: object.material,
          });
        }
      }
    });

    setZoneMeshes(found);
  }, [scene, parseResult]);

  // Create highlight materials
  const materials = useMemo(() => {
    const mats: Record<string, {
      normal: THREE.MeshBasicMaterial;
      hovered: THREE.MeshBasicMaterial;
      selected: THREE.MeshBasicMaterial;
    }> = {};

    Object.entries(zoneConfigs).forEach(([zoneId, config]) => {
      const color = config.highlightColor || '#4a9eff';
      mats[zoneId] = {
        normal: createZoneHighlightMaterial(color, 0.15),
        hovered: createZoneHighlightMaterial(color, 0.4),
        selected: createZoneHighlightMaterial(color, 0.6),
      };
    });

    return mats;
  }, [zoneConfigs]);

  // Apply highlights to zone meshes
  useEffect(() => {
    zoneMeshes.forEach(({ zoneId, mesh }) => {
      const zoneMats = materials[zoneId];
      if (!zoneMats) return;

      // Determine which material to use
      let overlayMaterial: THREE.MeshBasicMaterial;
      if (selectedZoneId === zoneId) {
        overlayMaterial = zoneMats.selected;
      } else if (hoveredZoneId === zoneId) {
        overlayMaterial = zoneMats.hovered;
      } else {
        overlayMaterial = zoneMats.normal;
      }

      // Create overlay mesh if not exists
      const overlayName = `__zone_overlay_${zoneId}`;
      let overlay = mesh.getObjectByName(overlayName) as THREE.Mesh | undefined;

      if (!overlay) {
        overlay = new THREE.Mesh(mesh.geometry.clone(), overlayMaterial);
        overlay.name = overlayName;
        overlay.renderOrder = 1;
        mesh.add(overlay);
      } else {
        overlay.material = overlayMaterial;
      }
    });

    // Cleanup function to remove overlays
    return () => {
      zoneMeshes.forEach(({ zoneId, mesh }) => {
        const overlayName = `__zone_overlay_${zoneId}`;
        const overlay = mesh.getObjectByName(overlayName);
        if (overlay) {
          mesh.remove(overlay);
          if (overlay instanceof THREE.Mesh) {
            overlay.geometry.dispose();
          }
        }
      });
    };
  }, [zoneMeshes, materials, selectedZoneId, hoveredZoneId]);

  // Cleanup materials on unmount
  useEffect(() => {
    return () => {
      Object.values(materials).forEach((mats) => {
        mats.normal.dispose();
        mats.hovered.dispose();
        mats.selected.dispose();
      });
    };
  }, [materials]);

  // This component doesn't render anything directly - it modifies the scene
  return null;
}

/**
 * Zone outline effect for better visibility.
 * Creates an outline around zone meshes when selected.
 */
export function ZoneOutline() {
  const { scene } = useThree();
  const selectedZoneId = useModel3DStore((s) => s.selectedZoneId);
  const zoneConfigs = useModel3DStore((s) => s.zoneConfigs);

  useEffect(() => {
    if (!selectedZoneId) return;

    const config = zoneConfigs[selectedZoneId];
    if (!config) return;

    const targetName = `${ZONE_PREFIX}${selectedZoneId}`;
    let targetMesh: THREE.Mesh | null = null;

    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.name.toLowerCase() === targetName) {
        targetMesh = object;
      }
    });

    if (!targetMesh) return;

    // Create outline mesh
    const outlineMaterial = new THREE.MeshBasicMaterial({
      color: config.highlightColor || '#ffffff',
      side: THREE.BackSide,
    });

    const outlineMesh = new THREE.Mesh(
      (targetMesh as THREE.Mesh).geometry.clone(),
      outlineMaterial
    );
    outlineMesh.name = '__zone_outline';
    outlineMesh.scale.multiplyScalar(1.02);
    targetMesh.add(outlineMesh);

    return () => {
      if (targetMesh) {
        const outline = targetMesh.getObjectByName('__zone_outline');
        if (outline) {
          targetMesh.remove(outline);
          if (outline instanceof THREE.Mesh) {
            outline.geometry.dispose();
            (outline.material as THREE.Material).dispose();
          }
        }
      }
    };
  }, [scene, selectedZoneId, zoneConfigs]);

  return null;
}

export default ZoneHighlighter;

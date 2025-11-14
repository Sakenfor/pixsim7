import { useEffect, useCallback } from 'react';
import { useControlCubeStore } from '../stores/controlCubeStore';

const DOCK_SNAP_DISTANCE = 80; // pixels from panel edge to trigger docking

export interface PanelRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Hook for handling cube docking behavior to panels
 */
export function useCubeDocking(panelRects: PanelRect[]) {
  const cubes = useControlCubeStore((s) => s.cubes);
  const dockCubeToPanel = useControlCubeStore((s) => s.dockCubeToPanel);
  const undockCube = useControlCubeStore((s) => s.undockCube);

  const checkDocking = useCallback(() => {
    Object.entries(cubes).forEach(([cubeId, cube]) => {
      if (cube.mode === 'docked' || !cube.visible) return;

      let closestPanel: { panelId: string; distance: number } | null = null;

      // Check distance to each panel
      panelRects.forEach((panel) => {
        // Calculate distances to panel edges
        const distances = [
          // Top edge
          Math.abs(cube.position.y - panel.y),
          // Bottom edge
          Math.abs(cube.position.y - (panel.y + panel.height)),
          // Left edge
          Math.abs(cube.position.x - panel.x),
          // Right edge
          Math.abs(cube.position.x - (panel.x + panel.width)),
        ];

        const minDistance = Math.min(...distances);

        // Check if cube center is near panel
        const centerX = cube.position.x + 50; // cube size / 2
        const centerY = cube.position.y + 50;

        const isNearPanel =
          centerX >= panel.x - DOCK_SNAP_DISTANCE &&
          centerX <= panel.x + panel.width + DOCK_SNAP_DISTANCE &&
          centerY >= panel.y - DOCK_SNAP_DISTANCE &&
          centerY <= panel.y + panel.height + DOCK_SNAP_DISTANCE;

        if (isNearPanel && minDistance < DOCK_SNAP_DISTANCE) {
          if (!closestPanel || minDistance < closestPanel.distance) {
            closestPanel = { panelId: panel.id, distance: minDistance };
          }
        }
      });

      // Dock to closest panel or undock
      if (closestPanel) {
        if (cube.dockedToPanelId !== closestPanel.panelId) {
          dockCubeToPanel(cubeId, closestPanel.panelId);
        }
      } else if (cube.dockedToPanelId) {
        undockCube(cubeId);
      }
    });
  }, [cubes, panelRects, dockCubeToPanel, undockCube]);

  return { checkDocking };
}

/**
 * Hook to get panel rectangles from DOM
 */
export function usePanelRects(): PanelRect[] {
  const panelRects: PanelRect[] = [];

  // Query all panels with data-panel-id attribute
  const panelElements = document.querySelectorAll('[data-panel-id]');

  panelElements.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const panelId = el.getAttribute('data-panel-id');

    if (panelId) {
      panelRects.push({
        id: panelId,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    }
  });

  return panelRects;
}

import { useCallback, useLayoutEffect, useState, useRef } from 'react';
import { useControlCubeStore } from '../stores/controlCubeStore';
import { BASE_CUBE_SIZE } from '../config/cubeConstants';

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
        const cubeHalfSize = (BASE_CUBE_SIZE * (cube.scale ?? 1)) / 2;
        const centerX = cube.position.x + cubeHalfSize;
        const centerY = cube.position.y + cubeHalfSize;

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
 * Hook to get panel rectangles from DOM.
 * Measures panel positions on mount and on window resize/scroll.
 * Uses throttling to prevent excessive measurements.
 */
export function usePanelRects(): PanelRect[] {
  const [panelRects, setPanelRects] = useState<PanelRect[]>([]);
  const throttleTimeoutRef = useRef<number | null>(null);
  const lastMeasureTimeRef = useRef<number>(0);

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const measure = () => {
      const rects: PanelRect[] = [];

      const panelElements = document.querySelectorAll('[data-panel-id]');

      panelElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const panelId = el.getAttribute('data-panel-id');

        if (panelId) {
          rects.push({
            id: panelId,
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          });
        }
      });

      setPanelRects(rects);
      lastMeasureTimeRef.current = Date.now();
    };

    // Throttled measure: limits measurements to once per 100ms
    const throttledMeasure = () => {
      const now = Date.now();
      const timeSinceLastMeasure = now - lastMeasureTimeRef.current;

      // If enough time has passed, measure immediately
      if (timeSinceLastMeasure >= 100) {
        measure();
      } else {
        // Otherwise, schedule a measurement for later
        if (throttleTimeoutRef.current !== null) {
          clearTimeout(throttleTimeoutRef.current);
        }
        throttleTimeoutRef.current = setTimeout(() => {
          measure();
          throttleTimeoutRef.current = null;
        }, 100 - timeSinceLastMeasure) as unknown as number;
      }
    };

    // Initial measure
    measure();

    // Re-measure on resize and scroll (throttled)
    window.addEventListener('resize', throttledMeasure);
    window.addEventListener('scroll', throttledMeasure, true);

    return () => {
      window.removeEventListener('resize', throttledMeasure);
      window.removeEventListener('scroll', throttledMeasure, true);
      if (throttleTimeoutRef.current !== null) {
        clearTimeout(throttleTimeoutRef.current);
      }
    };
  }, []);

  return panelRects;
}

/**
 * Cube Widget Overlay
 *
 * Renders all cubes from the store as draggable 3D cubes.
 * Cubes are spawned on-demand via context menu ("Spawn as Cube").
 *
 * Keyboard shortcuts:
 * - Ctrl+Shift+C: Toggle cube visibility
 */

import { clsx } from 'clsx';
import { useEffect, useCallback } from 'react';

import { useWorkspaceStore } from '@features/workspace';

import { getCubeFaceContent, getMinimizedPanelFaceContent } from './components/CubeFaceContent';
import { DraggableCube } from './components/DraggableCube';
import { useCubeSettingsStore } from './stores/cubeSettingsStore';
import { useCubeStore } from './useCubeStore';

const CUBE_SIZE = 80;

export function CubeWidgetOverlay() {
  const visible = useCubeSettingsStore((s) => s.visible);
  const toggleVisible = useCubeSettingsStore((s) => s.toggleVisible);

  const cubes = useCubeStore((s) => s.cubes);
  const restorePanelFromCube = useCubeStore((s) => s.restorePanelFromCube);
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);

  const handleCubeClick = useCallback(
    (cubeId: string) => {
      const cube = cubes[cubeId];
      if (!cube) return;

      if (cube.minimizedPanel) {
        const panelData = restorePanelFromCube(cubeId);
        if (panelData) {
          openFloatingPanel(panelData.panelId, {
            x: panelData.originalPosition.x,
            y: panelData.originalPosition.y,
            width: panelData.originalSize.width,
            height: panelData.originalSize.height,
          });
        }
      }
    },
    [cubes, restorePanelFromCube, openFloatingPanel]
  );

  // Ctrl+Shift+C to toggle visibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
        e.preventDefault();
        toggleVisible();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleVisible]);

  const allCubes = Object.values(cubes);
  if (allCubes.length === 0) return null;

  return (
    <div
      className={clsx(
        'fixed inset-0 pointer-events-none z-40 transition-all duration-300',
        visible ? 'opacity-100' : 'opacity-0 translate-y-12'
      )}
    >
      {allCubes.map((cube) => (
        <DraggableCube
          key={cube.id}
          cubeId={cube.id}
          size={CUBE_SIZE}
          faceContent={
            cube.minimizedPanel
              ? getMinimizedPanelFaceContent(cube.minimizedPanel.panelId)
              : getCubeFaceContent(cube.type)
          }
          onFaceClick={() => handleCubeClick(cube.id)}
        />
      ))}
    </div>
  );
}

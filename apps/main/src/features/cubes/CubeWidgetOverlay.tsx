/**
 * Cube Widget Overlay
 *
 * Renders all cubes from the store as draggable 3D cubes.
 * Minimized panel cubes are grouped into a single MinimizedPanelStack.
 *
 * Keyboard shortcuts:
 * - Ctrl+Shift+C: Toggle cube visibility
 */

import { clsx } from 'clsx';
import { useEffect, useMemo } from 'react';

import { moduleRegistry } from '@app/modules';

import { getCubeFaceContent } from './components/CubeFaceContent';
import { DraggableCube } from './components/DraggableCube';
import { MinimizedPanelStack } from './components/MinimizedPanelStack';
import { useCubeSettingsStore } from './stores/cubeSettingsStore';
import { useCubeStore } from './useCubeStore';

const CUBE_SIZE = 80;

export function CubeWidgetOverlay() {
  const visible = useCubeSettingsStore((s) => s.visible);
  const toggleVisible = useCubeSettingsStore((s) => s.toggleVisible);

  const cubes = useCubeStore((s) => s.cubes);

  useEffect(() => {
    void moduleRegistry.initializeModule('cubes').catch((error) => {
      console.warn('[CubeWidgetOverlay] Failed to initialize cubes module:', error);
    });
  }, []);

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

  // Split cubes into regular cubes and minimized-panel cubes
  const { regularCubes, panelCubes } = useMemo(() => {
    const regular = allCubes.filter((c) => !c.minimizedPanel);
    const panels = allCubes.filter((c) => c.minimizedPanel != null);
    return { regularCubes: regular, panelCubes: panels };
  }, [allCubes]);

  return (
    <>
      {/* Regular cubes — visibility-toggled layer */}
      {regularCubes.length > 0 && (
        <div
          className={clsx(
            'fixed inset-0 pointer-events-none z-40 transition-all duration-300',
            visible ? 'opacity-100' : 'opacity-0 translate-y-12',
          )}
        >
          {regularCubes.map((cube) => (
            <DraggableCube
              key={cube.id}
              cubeId={cube.id}
              size={CUBE_SIZE}
              faceContent={getCubeFaceContent(cube.type)}
            />
          ))}
        </div>
      )}

      {/* Cube indicator — always visible (multi-face widget hub) */}
      <MinimizedPanelStack panelCubes={panelCubes} />
    </>
  );
}

/**
 * Cube Widget Overlay
 *
 * Renders all cubes from the store as draggable 3D cubes.
 * Minimized panel cubes are grouped by cube instance into separate MinimizedPanelStack widgets.
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
import { useCubeInstanceStore, selectOrderedInstances } from './stores/cubeInstanceStore';
import { useCubeSettingsStore } from './stores/cubeSettingsStore';
import { useCubeStore, type ControlCube } from './useCubeStore';

const CUBE_SIZE = 80;

export function CubeWidgetOverlay() {
  const visible = useCubeSettingsStore((s) => s.visible);
  const toggleVisible = useCubeSettingsStore((s) => s.toggleVisible);

  const cubes = useCubeStore((s) => s.cubes);
  const instancesMap = useCubeInstanceStore((s) => s.instances);
  const instances = useMemo(() => selectOrderedInstances(instancesMap), [instancesMap]);

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

  // Split cubes into regular cubes and minimized-panel cubes, grouped by instance
  const { regularCubes, panelCubesByInstance } = useMemo(() => {
    const regular = allCubes.filter((c) => !c.minimizedPanel);
    const byInstance: Record<string, ControlCube[]> = {};
    for (const inst of instances) byInstance[inst.id] = [];
    for (const cube of allCubes) {
      if (!cube.minimizedPanel) continue;
      const instId = cube.cubeInstanceId ?? 'default';
      if (!byInstance[instId]) byInstance[instId] = [];
      byInstance[instId].push(cube);
    }
    return { regularCubes: regular, panelCubesByInstance: byInstance };
  }, [allCubes, instances]);

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

      {/* Cube instances — each gets its own MinimizedPanelStack widget */}
      {instances.map((inst) => (
        <MinimizedPanelStack
          key={inst.id}
          panelCubes={panelCubesByInstance[inst.id] ?? []}
          instanceId={inst.id}
        />
      ))}
    </>
  );
}

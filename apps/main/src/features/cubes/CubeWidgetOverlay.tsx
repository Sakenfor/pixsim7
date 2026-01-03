/**
 * Cube Widget Overlay
 *
 * A standalone overlay for rendering 3D cubes with formation patterns.
 * Works alongside Dock - not as a control center replacement.
 *
 * Features:
 * - Formation patterns (arc, dock, grid, circle, constellation, scattered)
 * - Draggable cubes
 * - Minimized panel cubes
 * - Keyboard shortcuts
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import { useCubeStore, type CubeType, type FormationPattern } from './useCubeStore';
import { useCubeSettingsStore } from './stores/cubeSettingsStore';
import {
  calculateFormation,
  interpolatePosition,
  easeInOutCubic,
} from '@pixsim7/pixcubes';
import { DraggableCube } from './components/DraggableCube';
import { getCubeFaceContent, getMinimizedPanelFaceContent } from './components/CubeFaceContent';
import { useWorkspaceStore, type PanelId } from '@features/workspace';

const CUBE_SIZE = 80;

interface CubeWidgetOverlayProps {
  /** Whether the overlay is visible */
  visible?: boolean;
  /** Callback when visibility changes */
  onVisibilityChange?: (visible: boolean) => void;
  /** Initial formation pattern */
  initialFormation?: FormationPattern;
  /** Initial cube types to create */
  initialCubeTypes?: CubeType[];
}

export function CubeWidgetOverlay(props: CubeWidgetOverlayProps) {
  const {
    visible: controlledVisible,
    onVisibilityChange,
    initialFormation,
    initialCubeTypes = ['control', 'preset', 'provider', 'panel'],
  } = props;
  const hasVisibleProp = 'visible' in props;
  const hasInitialFormationProp = 'initialFormation' in props;

  const storeVisible = useCubeSettingsStore((s) => s.visible);
  const setVisible = useCubeSettingsStore((s) => s.setVisible);
  const toggleVisible = useCubeSettingsStore((s) => s.toggleVisible);
  const formation = useCubeSettingsStore((s) => s.formation);
  const setFormation = useCubeSettingsStore((s) => s.setFormation);

  const [formationCubeIds, setFormationCubeIds] = useState<string[]>([]);

  // Store hooks
  const cubes = useCubeStore((s) => s.cubes);
  const hydrated = useCubeStore((s) => s.hydrated);
  const addCube = useCubeStore((s) => s.addCube);
  const updateCube = useCubeStore((s) => s.updateCube);
  const restorePanelFromCube = useCubeStore((s) => s.restorePanelFromCube);

  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);

  // Sync external visibility/formation overrides into the store
  useEffect(() => {
    if (!hasVisibleProp || controlledVisible === undefined) return;
    if (controlledVisible !== storeVisible) {
      setVisible(controlledVisible);
    }
  }, [hasVisibleProp, controlledVisible, storeVisible, setVisible]);

  useEffect(() => {
    if (!hasInitialFormationProp || initialFormation === undefined) return;
    if (initialFormation !== formation) {
      setFormation(initialFormation);
    }
  }, [hasInitialFormationProp, initialFormation, formation, setFormation]);

  const visible = storeVisible;

  // Calculate formation positions
  const targetPositions = useMemo(() => {
    return calculateFormation({
      pattern: formation,
      cubeCount: initialCubeTypes.length,
      radius: formation === 'arc' ? 280 : 200,
      spacing: 100,
    });
  }, [formation, initialCubeTypes.length]);

  // Initialize formation cubes
  useEffect(() => {
    if (!hydrated) return;
    if (formationCubeIds.length > 0) return;

    const existingIds = Object.keys(cubes);

    // Try to reuse existing cubes
    if (existingIds.length > 0) {
      const ids: string[] = [];
      initialCubeTypes.forEach((cubeType) => {
        const existing = existingIds
          .map((id) => cubes[id])
          .find((cube) => cube && cube.type === cubeType && !ids.includes(cube.id));
        if (existing) {
          ids.push(existing.id);
        }
      });

      if (ids.length > 0) {
        setFormationCubeIds(ids);
        return;
      }
    }

    // Create new formation cubes
    const ids: string[] = [];
    initialCubeTypes.forEach((cubeType, index) => {
      const pos = targetPositions[index];
      const id = addCube(cubeType, pos);
      ids.push(id);
    });

    setFormationCubeIds(ids);
  }, [hydrated, cubes, addCube, targetPositions, formationCubeIds.length, initialCubeTypes]);

  // Animate cubes when formation changes
  useEffect(() => {
    if (formationCubeIds.length === 0) return;

    const duration = 800;
    const startTime = Date.now();
    const startPositions = formationCubeIds.map(
      (id) => cubes[id]?.position || { x: 0, y: 0 }
    );

    let frameId: number | null = null;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const rawProgress = Math.min(elapsed / duration, 1);
      const progress = easeInOutCubic(rawProgress);

      formationCubeIds.forEach((id, index) => {
        if (!cubes[id]) return;
        const from = startPositions[index];
        const to = targetPositions[index];
        const position = interpolatePosition(from, to, progress);
        updateCube(id, { position });
      });

      if (rawProgress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [formation, targetPositions]);

  // Get standalone cubes (not in formation)
  const standaloneCubes = useMemo(() => {
    return Object.values(cubes).filter((cube) => !formationCubeIds.includes(cube.id));
  }, [cubes, formationCubeIds]);

  // Handle standalone cube click (e.g., restore minimized panel)
  const handleStandaloneCubeClick = useCallback(
    (cubeId: string) => {
      const cube = cubes[cubeId];
      if (!cube) return;

      if (cube.minimizedPanel) {
        const panelData = restorePanelFromCube(cubeId);
        if (panelData) {
          openFloatingPanel(
            panelData.panelId as PanelId,
            panelData.originalPosition.x,
            panelData.originalPosition.y,
            panelData.originalSize.width,
            panelData.originalSize.height
          );
        }
      }
    },
    [cubes, restorePanelFromCube, openFloatingPanel]
  );

  // Handle formation cube click
  const handleFormationCubeClick = useCallback(
    (cubeId: string, face: string) => {
      const cube = cubes[cubeId];
      if (!cube) return;

      // For now, just log the click - can be extended later
      console.log(`Cube ${cube.type} face ${face} clicked`);
    },
    [cubes]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+F to cycle formations
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyF') {
        e.preventDefault();
        const patterns: FormationPattern[] = [
          'dock',
          'arc',
          'circle',
          'grid',
          'constellation',
          'scattered',
        ];
        const currentIndex = patterns.indexOf(formation);
        const nextIndex = (currentIndex + 1) % patterns.length;
        setFormation(patterns[nextIndex]);
      }

      // Ctrl+Shift+C to toggle visibility
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
        e.preventDefault();
        const newVisible = toggleVisible();
        onVisibilityChange?.(newVisible);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formation, toggleVisible, onVisibilityChange]);

  // Visibility toggle function
  const toggleVisibility = useCallback(() => {
    const newVisible = toggleVisible();
    onVisibilityChange?.(newVisible);
  }, [toggleVisible, onVisibilityChange]);

  return (
    <>
      {/* Main overlay */}
      <div
        className={clsx(
          'fixed inset-0 pointer-events-none z-40 transition-all duration-300',
          visible ? 'opacity-100' : 'opacity-0 translate-y-12'
        )}
      >
        {/* Formation cubes */}
        {formationCubeIds.map((cubeId) => {
          const cube = cubes[cubeId];
          if (!cube) return null;

          return (
            <DraggableCube
              key={cubeId}
              cubeId={cubeId}
              size={CUBE_SIZE}
              faceContent={getCubeFaceContent(cube.type)}
              onFaceClick={(face) => handleFormationCubeClick(cubeId, face)}
            />
          );
        })}

        {/* Standalone cubes (minimized panels, etc.) */}
        {standaloneCubes.map((cube) => (
          <DraggableCube
            key={cube.id}
            cubeId={cube.id}
            size={CUBE_SIZE}
            faceContent={
              cube.minimizedPanel
                ? getMinimizedPanelFaceContent(cube.minimizedPanel.panelId)
                : getCubeFaceContent(cube.type)
            }
            onFaceClick={() => handleStandaloneCubeClick(cube.id)}
          />
        ))}

        {/* Formation indicator (visible when overlay is shown) */}
        {visible && (
          <div className="fixed bottom-4 left-4 pointer-events-auto bg-black/80 backdrop-blur-md rounded-lg px-3 py-2 text-xs text-white/80 border border-white/20">
            <div className="font-bold text-white mb-1">Formation: {formation}</div>
            <div className="text-[10px] text-white/60">
              <kbd className="px-1 bg-white/20 rounded">Ctrl+Shift+F</kbd> Cycle
            </div>
          </div>
        )}
      </div>

      {/* Control buttons */}
      <div className="fixed bottom-4 right-4 pointer-events-auto flex gap-2 items-center z-50">
        <button
          onClick={toggleVisibility}
          className="px-3 py-2 text-xs border rounded-lg bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm transition-all border-white/20"
        >
          {visible ? 'Hide Cubes' : 'Show Cubes'}
        </button>

        <select
          value={formation}
          onChange={(e) => setFormation(e.target.value as FormationPattern)}
          className="px-3 py-2 text-xs border rounded-lg bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm transition-all border-white/20"
        >
          <option value="dock">Dock</option>
          <option value="arc">Arc</option>
          <option value="circle">Circle</option>
          <option value="grid">Grid</option>
          <option value="constellation">Constellation</option>
          <option value="scattered">Scattered</option>
        </select>
      </div>
    </>
  );
}

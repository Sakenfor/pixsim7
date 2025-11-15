import { useEffect, useCallback, useRef, useState } from 'react';
import { DraggableCube } from './DraggableCube';
import { getCubeFaceContent } from './CubeFaceContent';
import { PanelActionEditor } from './PanelActionEditor';
import { useControlCubeStore, type CubeFace, type CubeType } from '../../stores/controlCubeStore';
import { usePanelRects, useCubeDocking } from '../../hooks/useCubeDocking';
import { panelActionRegistry, type PanelActionsConfig } from '../../lib/panelActions';
import { clsx } from 'clsx';

export interface ControlCubeManagerProps {
  className?: string;
}

const SNAP_DISTANCE = 50; // pixels
const COMBINE_DISTANCE = 120; // pixels to start combining

export function ControlCubeManager({ className }: ControlCubeManagerProps) {
  const managerRef = useRef<HTMLDivElement>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const cubes = useControlCubeStore((s) => s.cubes);
  const summoned = useControlCubeStore((s) => s.summoned);
  const activeCubeId = useControlCubeStore((s) => s.activeCubeId);
  const combinedCubeIds = useControlCubeStore((s) => s.combinedCubeIds);

  const addCube = useControlCubeStore((s) => s.addCube);
  const summonCubes = useControlCubeStore((s) => s.summonCubes);
  const dismissCubes = useControlCubeStore((s) => s.dismissCubes);
  const rotateCubeFace = useControlCubeStore((s) => s.rotateCubeFace);
  const updateCube = useControlCubeStore((s) => s.updateCube);
  const combineCubes = useControlCubeStore((s) => s.combineCubes);
  const separateCubes = useControlCubeStore((s) => s.separateCubes);
  const dockCubeToPanel = useControlCubeStore((s) => s.dockCubeToPanel);

  // Get panel rectangles for docking
  const panelRects = usePanelRects();
  const { checkDocking } = useCubeDocking(panelRects);

  // Initialize default cubes on first mount
  useEffect(() => {
    const cubeCount = Object.keys(cubes).length;
    if (cubeCount === 0) {
      // Create initial control cube in center
      const centerX = window.innerWidth / 2 - 50;
      const centerY = window.innerHeight / 2 - 50;
      addCube('control', { x: centerX, y: centerY });
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Space: Summon/dismiss cubes
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        if (summoned) {
          dismissCubes();
        } else {
          summonCubes();
        }
      }

      // Ctrl+Shift+C: Add control cube
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
        e.preventDefault();
        const pos = {
          x: Math.random() * (window.innerWidth - 200) + 100,
          y: Math.random() * (window.innerHeight - 200) + 100,
        };
        addCube('control', pos);
      }

      // Ctrl+Shift+P: Add provider cube
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyP') {
        e.preventDefault();
        const pos = {
          x: Math.random() * (window.innerWidth - 200) + 100,
          y: Math.random() * (window.innerHeight - 200) + 100,
        };
        addCube('provider', pos);
      }

      // Arrow keys: Rotate active cube
      if (activeCubeId && cubes[activeCubeId]) {
        const cube = cubes[activeCubeId];
        if (e.code === 'ArrowUp') {
          e.preventDefault();
          rotateCubeFace(activeCubeId, 'top');
        } else if (e.code === 'ArrowDown') {
          e.preventDefault();
          rotateCubeFace(activeCubeId, 'bottom');
        } else if (e.code === 'ArrowLeft') {
          e.preventDefault();
          rotateCubeFace(activeCubeId, 'left');
        } else if (e.code === 'ArrowRight') {
          e.preventDefault();
          rotateCubeFace(activeCubeId, 'right');
        }
      }

      // R: Toggle rotating mode for active cube
      if (e.code === 'KeyR' && activeCubeId && !e.ctrlKey) {
        e.preventDefault();
        const cube = cubes[activeCubeId];
        if (cube) {
          updateCube(activeCubeId, {
            mode: cube.mode === 'rotating' ? 'idle' : 'rotating',
          });
        }
      }

      // E: Toggle expanded mode for active cube
      if (e.code === 'KeyE' && activeCubeId && !e.ctrlKey) {
        e.preventDefault();
        const cube = cubes[activeCubeId];
        if (cube) {
          updateCube(activeCubeId, {
            mode: cube.mode === 'expanded' ? 'idle' : 'expanded',
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [summoned, activeCubeId, cubes]);

  // Check for cube proximity (for combining)
  const checkCubeProximity = useCallback(() => {
    const cubeIds = Object.keys(cubes);
    if (cubeIds.length < 2) return;

    const distances: Array<{ id1: string; id2: string; distance: number }> = [];

    // Calculate distances between all cube pairs
    for (let i = 0; i < cubeIds.length; i++) {
      for (let j = i + 1; j < cubeIds.length; j++) {
        const cube1 = cubes[cubeIds[i]];
        const cube2 = cubes[cubeIds[j]];

        if (!cube1 || !cube2 || cube1.mode === 'docked' || cube2.mode === 'docked') continue;

        const dx = cube1.position.x - cube2.position.x;
        const dy = cube1.position.y - cube2.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        distances.push({ id1: cubeIds[i], id2: cubeIds[j], distance });
      }
    }

    // Find cubes close enough to combine
    const closePairs = distances.filter((d) => d.distance < COMBINE_DISTANCE);

    if (closePairs.length > 0 && combinedCubeIds.length === 0) {
      // Combine the closest pair
      const closest = closePairs.sort((a, b) => a.distance - b.distance)[0];
      combineCubes([closest.id1, closest.id2]);
    } else if (closePairs.length === 0 && combinedCubeIds.length > 0) {
      // Separate if they moved apart
      separateCubes();
    }
  }, [cubes, combinedCubeIds, combineCubes, separateCubes]);

  // Check proximity and docking on drag
  const handleDragStop = useCallback(() => {
    checkCubeProximity();
    checkDocking();
  }, [checkCubeProximity, checkDocking]);

  const handleFaceClick = (cubeId: string, face: CubeFace) => {
    rotateCubeFace(cubeId, face);
    console.log(`Cube ${cubeId} face ${face} clicked`);
  };

  const handleSaveConfig = useCallback((config: PanelActionsConfig) => {
    panelActionRegistry.register(config);
    setEditorOpen(false);
    alert(`Panel actions saved for ${config.panelName}!`);
  }, []);

  return (
    <>
      {/* Cube container */}
      <div
        ref={managerRef}
        className={clsx(
          'fixed inset-0 pointer-events-none z-[9999]',
          'transition-opacity duration-300',
          summoned ? 'opacity-100' : 'opacity-0',
          className
        )}
      >
        {Object.entries(cubes).map(([id, cube]) => (
          <DraggableCube
            key={id}
            cubeId={id}
            size={100}
            faceContent={getCubeFaceContent(cube.type, cube.dockedToPanelId)}
            onDragStop={handleDragStop}
            onFaceClick={(face) => handleFaceClick(id, face)}
          />
        ))}

        {/* Help overlay */}
        {summoned && (
          <div className="fixed bottom-4 left-4 pointer-events-auto bg-black/80 backdrop-blur-md rounded-lg p-4 text-xs text-white/80 space-y-1 border border-white/20">
            <div className="font-bold text-white mb-2">🎮 Control Cubes</div>
            <div><kbd className="px-1 py-0.5 bg-white/20 rounded">Ctrl+Space</kbd> Toggle Cubes</div>
            <div><kbd className="px-1 py-0.5 bg-white/20 rounded">Ctrl+Shift+C</kbd> Add Control Cube</div>
            <div><kbd className="px-1 py-0.5 bg-white/20 rounded">Ctrl+Shift+P</kbd> Add Provider Cube</div>
            <div><kbd className="px-1 py-0.5 bg-white/20 rounded">Arrow Keys</kbd> Rotate Active Cube</div>
            <div><kbd className="px-1 py-0.5 bg-white/20 rounded">R</kbd> Auto-Rotate</div>
            <div><kbd className="px-1 py-0.5 bg-white/20 rounded">E</kbd> Expand/Collapse</div>
            <div className="pt-2 text-white/60 text-[10px]">
              💡 Drag cubes close together to combine them
            </div>
            <button
              onClick={() => setEditorOpen(true)}
              className="mt-3 w-full px-2 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
            >
              🎨 Open Action Editor
            </button>
          </div>
        )}
      </div>

      {/* Summon button (when dismissed) */}
      {!summoned && (
        <button
          onClick={summonCubes}
          className="fixed bottom-4 right-4 z-[9998] pointer-events-auto
                     w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600
                     hover:from-blue-600 hover:to-purple-700
                     shadow-lg shadow-purple-500/50 hover:shadow-xl hover:shadow-purple-500/70
                     transition-all duration-300 hover:scale-110 active:scale-95
                     flex items-center justify-center text-2xl
                     border border-white/20"
          title="Summon Control Cubes (Ctrl+Space)"
        >
          🎲
        </button>
      )}

      {/* Panel Action Editor */}
      {editorOpen && (
        <PanelActionEditor
          onSave={handleSaveConfig}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </>
  );
}

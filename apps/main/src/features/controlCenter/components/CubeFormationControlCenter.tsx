import { useEffect, useState, useCallback, useMemo } from 'react';
import { useControlCubeStore, type CubeType } from '@features/controlCenter/stores/controlCubeStore';
import { useControlCenterStore, type ControlModule } from '@features/controlCenter/stores/controlCenterStore';
import { useWorkspaceStore, type PanelId } from '@features/workspace';
import { ControlCube } from './ControlCube';
import { DraggableCube } from './DraggableCube';
import { getCubeFaceContent } from './CubeFaceContent';
import {
  calculateFormation,
  interpolatePosition,
  easeInOutCubic,
  type FormationPattern,
} from '@features/controlCenter/lib/cubes/cubeFormations';
import { clsx } from 'clsx';
import { QuickGenerateModule } from './QuickGenerateModule';
import { PresetsModule } from './PresetsModule';
import { ProviderOverviewModule } from '@features/providers';
import { PanelLauncherModule } from './PanelLauncherModule';
import { CubeSettingsPanel } from './CubeSettingsPanel';

/**
 * Map control modules to cube types
 */
const MODULE_CUBE_MAP: Record<ControlModule, CubeType | null> = {
  quickGenerate: 'control',
  presets: 'preset',
  providers: 'provider',
  panels: 'panel',
  none: null,
};

const MODULES: { id: ControlModule; label: string; cubeType: CubeType }[] = [
  { id: 'quickGenerate', label: 'Generate', cubeType: 'control' },
  { id: 'presets', label: 'Presets', cubeType: 'preset' },
  { id: 'providers', label: 'Providers', cubeType: 'provider' },
  { id: 'panels', label: 'Panels', cubeType: 'panel' },
];

const CUBE_SIZE = 80;

export function CubeFormationControlCenter() {
  const [formation, setFormation] = useState<FormationPattern>('arc');
  const [expandedModule, setExpandedModule] = useState<ControlModule | null>(null);
  const [transitionProgress, setTransitionProgress] = useState(1);
  const [showCubeSettings, setShowCubeSettings] = useState(false);

  const open = useControlCenterStore((s) => s.open);
  const pinned = useControlCenterStore((s) => s.pinned);
  const activeModule = useControlCenterStore((s) => s.activeModule);
  const setOpen = useControlCenterStore((s) => s.setOpen);
  const setPinned = useControlCenterStore((s) => s.setPinned);
  const setActiveModule = useControlCenterStore((s) => s.setActiveModule);
  const toggleMode = useControlCenterStore((s) => s.toggleMode);

  const addCube = useControlCubeStore((s) => s.addCube);
  const updateCube = useControlCubeStore((s) => s.updateCube);
  const removeCube = useControlCubeStore((s) => s.removeCube);
  const cubes = useControlCubeStore((s) => s.cubes);
  const hydrated = useControlCubeStore((s) => s.hydrated ?? true);
  const restorePanelFromCube = useControlCubeStore((s) => s.restorePanelFromCube);

  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);

  // Track cube IDs for this formation
  const [formationCubeIds, setFormationCubeIds] = useState<string[]>([]);

  // Calculate current formation positions
  const targetPositions = useMemo(() => {
    return calculateFormation({
      pattern: formation,
      cubeCount: MODULES.length,
      radius: formation === 'arc' ? 280 : 200,
      spacing: 100,
    });
  }, [formation]);

  // Initialize formation cubes after store hydration
  useEffect(() => {
    if (!hydrated) return;
    if (formationCubeIds.length > 0) return;

    const existingIds = Object.keys(cubes);

    // If there are existing cubes, treat matching ones as the formation
    if (existingIds.length > 0) {
      const ids: string[] = [];

      MODULES.forEach((module) => {
        const existing = existingIds
          .map((id) => cubes[id])
          .find((cube) => cube && cube.type === module.cubeType && !ids.includes(cube.id));
        if (existing) {
          ids.push(existing.id);
        }
      });

      if (ids.length > 0) {
        setFormationCubeIds(ids);
        return;
      }
    }

    // Otherwise, create default formation cubes
    const ids: string[] = [];
    MODULES.forEach((module, index) => {
      const pos = targetPositions[index];
      const id = addCube(module.cubeType, pos);
      ids.push(id);
    });

    setFormationCubeIds(ids);
  }, [hydrated, cubes, addCube, targetPositions, formationCubeIds.length]);

  // Update cube positions when formation changes
  useEffect(() => {
    if (formationCubeIds.length === 0) return;

    // Animate transition
    const duration = 800; // ms
    const startTime = Date.now();
    const startPositions = formationCubeIds.map(
      (id) => cubes[id]?.position || { x: 0, y: 0 }
    );

    let frameId: number | null = null;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const rawProgress = Math.min(elapsed / duration, 1);
      const progress = easeInOutCubic(rawProgress);

      setTransitionProgress(progress);

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

    // Cleanup: Cancel animation frame on unmount or dependency change
    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [formation, targetPositions]);

  // Get standalone cubes (cubes not part of the formation)
  const standaloneCubes = useMemo(() => {
    return Object.values(cubes).filter(cube => !formationCubeIds.includes(cube.id));
  }, [cubes, formationCubeIds]);

  // Handle cube face clicks
  const handleCubeFaceClick = useCallback(
    (cubeIndex: number, face: string) => {
      const module = MODULES[cubeIndex];
      if (!module) return;

      setActiveModule(module.id);
      setExpandedModule(expandedModule === module.id ? null : module.id);
    },
    [expandedModule, setActiveModule]
  );

  // Handle standalone cube clicks (e.g., minimized panels)
  const handleStandaloneCubeClick = useCallback(
    (cubeId: string) => {
      const cube = cubes[cubeId];
      if (!cube) return;

      // If this cube represents a minimized panel, restore it
      if (cube.minimizedPanel) {
        const panelData = restorePanelFromCube(cubeId);
        if (panelData) {
          openFloatingPanel(
            panelData.panelId,
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

  // Handle cube expansion (shift+drag from edge)
  const handleCubeExpand = useCallback(
    (cubeId: string, position: { x: number; y: number }) => {
      const cube = cubes[cubeId];
      if (!cube) return;

      // Map cube type to panel type
      const CUBE_TO_PANEL_MAP: Record<CubeType, PanelId> = {
        control: 'scene', // Control cubes could open scene builder
        provider: 'providers',
        preset: 'scene', // Presets could also open scene builder
        panel: 'graph',
        settings: 'providers',
        gallery: 'gallery',
      };

      const panelId = CUBE_TO_PANEL_MAP[cube.type];
      if (panelId) {
        // Open floating panel at cube position
        openFloatingPanel(panelId);

        // Optionally remove/hide the cube
        // removeCube(cubeId);
      }
    },
    [cubes, openFloatingPanel]
  );

  // Auto-hide when mouse leaves if not pinned
  const handleMouseLeave = useCallback(() => {
    if (!pinned) {
      setOpen(false);
    }
  }, [pinned, setOpen]);

  // Reveal on hover at bottom
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!open && e.clientY >= window.innerHeight - 10) {
        setOpen(true);
      }
    };

    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [open, setOpen]);

  // Cycle through formations with keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyF') {
        e.preventDefault();
        const patterns: FormationPattern[] = ['dock', 'arc', 'circle', 'grid', 'constellation'];
        const currentIndex = patterns.indexOf(formation);
        const nextIndex = (currentIndex + 1) % patterns.length;
        setFormation(patterns[nextIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formation]);

  const renderModuleContent = () => {
    if (!expandedModule) return null;

    switch (expandedModule) {
      case 'quickGenerate':
        return <QuickGenerateModule />;
      case 'presets':
        return <PresetsModule />;
      case 'providers':
        return <ProviderOverviewModule />;
      case 'panels':
        return <PanelLauncherModule />;
      default:
        return null;
    }
  };

  return (
    <>
      {/* Cube Formation */}
      <div
        className={clsx(
          'fixed inset-0 pointer-events-none z-40 transition-all duration-300',
          open ? 'opacity-100' : 'opacity-0 translate-y-12'
        )}
        onMouseLeave={handleMouseLeave}
      >
        {formationCubeIds.map((cubeId, index) => {
          const cube = cubes[cubeId];
          if (!cube) return null;

          const module = MODULES[index];
          const isActive = activeModule === module.id;

          return (
            <DraggableCube
              key={cubeId}
              cubeId={cubeId}
              size={CUBE_SIZE}
              faceContent={getCubeFaceContent(module.cubeType)}
              onFaceClick={(face) => handleCubeFaceClick(index, face)}
              onExpand={handleCubeExpand}
            />
          );
        })}

        {/* Standalone cubes (e.g., minimized panels) - always visible */}
        {standaloneCubes.map((cube) => (
          <div
            key={cube.id}
            className="absolute pointer-events-auto"
            style={{
              left: `${cube.position.x}px`,
              top: `${cube.position.y}px`,
              zIndex: cube.zIndex,
            }}
          >
            <DraggableCube
              cubeId={cube.id}
              size={100}
              faceContent={getCubeFaceContent(cube.type)}
              onFaceClick={() => handleStandaloneCubeClick(cube.id)}
              onExpand={handleCubeExpand}
            />

            {/* Panel indicator for minimized panels */}
            {cube.minimizedPanel && (
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-cyan-300 whitespace-nowrap bg-black/60 px-2 py-0.5 rounded backdrop-blur-sm cursor-pointer hover:bg-black/80 hover:text-cyan-200 transition-colors">
                📦 {cube.minimizedPanel.panelId} • Click to restore
              </div>
            )}
          </div>
        ))}

        {/* Formation Pattern Indicator */}
        {open && (
          <div className="fixed bottom-4 left-4 pointer-events-auto bg-black/80 backdrop-blur-md rounded-lg px-3 py-2 text-xs text-white/80 border border-white/20">
            <div className="font-bold text-white mb-1">🎲 Formation: {formation}</div>
            <div className="text-[10px] text-white/60">
              <kbd className="px-1 bg-white/20 rounded">Ctrl+Shift+F</kbd> Cycle
            </div>
          </div>
        )}

        {/* Control Bar */}
        <div className="fixed bottom-4 right-4 pointer-events-auto flex gap-2 items-center">
          <button
            onClick={() => setOpen(!open)}
            className="px-3 py-2 text-xs border rounded-lg bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm transition-all"
          >
            {open ? 'Hide' : 'Show'}
          </button>
          <button
            onClick={() => addCube('control')}
            className="px-3 py-2 text-xs border rounded-lg bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm transition-all"
          >
            + Cube
          </button>
          <button
            onClick={() => setPinned(!pinned)}
            className={clsx(
              'px-3 py-2 text-xs border rounded-lg backdrop-blur-sm transition-all',
              pinned
                ? 'bg-amber-600/80 text-white border-amber-400'
                : 'bg-black/60 hover:bg-black/80 text-white border-white/20'
            )}
          >
            {pinned ? '📌 Pinned' : 'Pin'}
          </button>

          {/* Mode toggle */}
          <button
            onClick={toggleMode}
            className="px-3 py-2 text-xs border border-purple-300/50 dark:border-purple-500/30 rounded-lg bg-purple-600/60 hover:bg-purple-700/80 text-white backdrop-blur-sm transition-all hover:scale-105 active:scale-95 shadow-md shadow-purple-500/30"
            title="Switch to Dock Mode"
          >
            🪟 Dock
          </button>

          {/* Formation selector */}
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
      </div>

      {/* Expanded Module Content Overlay */}
      {expandedModule && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setExpandedModule(null)}
        >
          <div
            className="bg-white dark:bg-neutral-900 rounded-lg shadow-2xl max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl w-full mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0 bg-white dark:bg-neutral-900 border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">
                {MODULES.find((m) => m.id === expandedModule)?.label}
              </h2>
              <button
                onClick={() => setExpandedModule(null)}
                className="px-3 py-1.5 text-sm border rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Close
              </button>
            </div>
            <div className="flex-1 p-6 overflow-y-auto min-h-0">{renderModuleContent()}</div>
          </div>
        </div>
      )}

      {/* Reveal strip */}
      {!open && (
        <div
          className="fixed bottom-0 left-0 right-0 h-2 z-39 bg-gradient-to-t from-blue-500/20 to-transparent cursor-pointer"
          onMouseEnter={() => setOpen(true)}
          title="Hover to reveal Control Center"
        />
      )}

      {showCubeSettings && <CubeSettingsPanel onClose={() => setShowCubeSettings(false)} />}
    </>
  );
}

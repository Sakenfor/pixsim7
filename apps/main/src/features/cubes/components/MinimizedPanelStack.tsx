/**
 * MinimizedPanelStack
 *
 * A single draggable indicator that groups all minimized floating panels.
 * Hover to fan out a vertical list of panels; click any item to restore it.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

import { Icon } from '@lib/icons';
import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { useWorkspaceStore } from '@features/workspace';
import { getFloatingDefinitionId } from '@features/workspace/lib/floatingPanelUtils';

import { useCubeStore, type ControlCube } from '../useCubeStore';

interface MinimizedPanelStackProps {
  panelCubes: ControlCube[];
}

export function MinimizedPanelStack({ panelCubes }: MinimizedPanelStackProps) {
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState(() => ({
    x: window.innerWidth / 2 - 28,
    y: window.innerHeight - 80,
  }));
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const restorePanelFromCube = useCubeStore((s) => s.restorePanelFromCube);
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);

  const handleRestore = useCallback(
    (cubeId: string) => {
      const panelData = restorePanelFromCube(cubeId);
      if (panelData) {
        openFloatingPanel(panelData.panelId, {
          x: panelData.originalPosition.x,
          y: panelData.originalPosition.y,
          width: panelData.originalSize.width,
          height: panelData.originalSize.height,
          context: panelData.context,
        });
      }
      if (panelCubes.length <= 1) {
        setExpanded(false);
      }
    },
    [restorePanelFromCube, openFloatingPanel, panelCubes.length],
  );

  const handleRestoreAll = useCallback(() => {
    for (const cube of panelCubes) {
      const panelData = restorePanelFromCube(cube.id);
      if (panelData) {
        openFloatingPanel(panelData.panelId, {
          x: panelData.originalPosition.x,
          y: panelData.originalPosition.y,
          width: panelData.originalSize.width,
          height: panelData.originalSize.height,
          context: panelData.context,
        });
      }
    }
    setExpanded(false);
  }, [panelCubes, restorePanelFromCube, openFloatingPanel]);

  // ── Drag ──
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      hasMoved.current = false;
      setIsDragging(true);
    },
    [position],
  );

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        hasMoved.current = true;
      }
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };
    const handleUp = () => {
      setIsDragging(false);
      if (!hasMoved.current) {
        setExpanded((prev) => !prev);
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging]);

  // ── Hover expand / collapse ──
  const handleMouseEnter = () => {
    if (isDragging) return;
    hoverTimerRef.current = setTimeout(() => setExpanded(true), 300);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (!isDragging) setExpanded(false);
  };

  // ── Helpers ──
  const getPanelTitle = (panelId: string) => {
    const defId = getFloatingDefinitionId(panelId);
    const def = panelSelectors.get(defId);
    return def?.title ?? defId;
  };

  return (
    <div
      className="pointer-events-auto"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 10200,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* ── Fan-out list (above the indicator) ── */}
      {expanded && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 min-w-[200px] bg-neutral-900/95 backdrop-blur-md border border-neutral-700 rounded-lg shadow-2xl overflow-hidden">
          <div className="px-3 py-2 border-b border-neutral-700/50 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
              Minimized Panels
            </span>
            {panelCubes.length > 1 && (
              <button
                type="button"
                onClick={handleRestoreAll}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                Restore all
              </button>
            )}
          </div>
          {panelCubes.map((cube) => (
            <button
              key={cube.id}
              type="button"
              onClick={() => handleRestore(cube.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-200 hover:bg-cyan-600/20 hover:text-cyan-300 transition-colors text-left"
            >
              <Icon name="layoutGrid" size={14} className="shrink-0 text-neutral-400" />
              <span className="truncate">
                {cube.minimizedPanel
                  ? getPanelTitle(cube.minimizedPanel.panelId)
                  : cube.id}
              </span>
              <Icon
                name="maximize2"
                size={12}
                className="ml-auto shrink-0 text-neutral-500"
              />
            </button>
          ))}
        </div>
      )}

      {/* ── Stack indicator (draggable) ── */}
      <div
        className={`
          relative w-14 h-14 rounded-xl cursor-grab select-none
          bg-neutral-800/90 backdrop-blur-md border
          ${expanded ? 'border-cyan-400/60 shadow-lg shadow-cyan-500/20' : 'border-neutral-600/50 hover:border-cyan-400/40'}
          flex items-center justify-center transition-all duration-200
        `}
        onMouseDown={handleMouseDown}
      >
        <Icon name="layoutGrid" size={22} className="text-cyan-400" />

        {/* Count badge */}
        <div className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 rounded-full bg-cyan-500 text-white text-[11px] font-bold flex items-center justify-center px-1 shadow-md">
          {panelCubes.length}
        </div>
      </div>
    </div>
  );
}

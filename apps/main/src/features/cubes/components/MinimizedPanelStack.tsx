/**
 * MinimizedPanelStack
 *
 * A draggable 3D cube indicator with multiple faces:
 * - **Front (panels)**: minimized floating panels carousel
 * - **Right (launcher)**: quick panel launcher grid
 * - **Back (pinned)**: placeholder
 * - **Left (recent)**: placeholder
 *
 * Hover tilts the cube (exponential, 40°) to reveal adjacent faces.
 * Click while tilted → switch to that face. Click centre → expand/collapse.
 */

import { PortalFloat, useHoverExpand, Z } from '@pixsim7/shared.ui';
import { useState, useCallback, useRef, useEffect, useMemo, useSyncExternalStore } from 'react';

import { Icon } from '@lib/icons';
import { useInsetOn } from '@lib/layout/edgeInsets';

import { useWorkspaceStore } from '@features/workspace';
import { getFloatingDefinitionId } from '@features/workspace/lib/floatingPanelUtils';

import { cubeFaceRegistry, type CubeFaceRegistry } from '../lib/cubeFaceRegistry';
import { useCubeHighlightStore } from '../stores/cubeHighlightStore';
import { getCubeSettingsStore, type CubeDockPosition } from '../stores/cubeSettingsStore';
import { useCubeStore, type ControlCube } from '../useCubeStore';

import { CubeIndicatorContext } from './CubeIndicatorContext';

interface MinimizedPanelStackProps {
  panelCubes: ControlCube[];
  /** Registry to source face definitions from. Defaults to the global cubeFaceRegistry. */
  registry?: CubeFaceRegistry;
  /** Instance ID — each cube instance gets its own settings store. Defaults to 'default'. */
  instanceId?: string;
}

// ── Constants ──

const CUBE_SIZE_IDLE = 44;
const CUBE_SIZE_ACTIVE = 56;
const HALF_IDLE = CUBE_SIZE_IDLE / 2;
const HALF_ACTIVE = CUBE_SIZE_ACTIVE / 2;
const TILT_MAX = 50;
const TILT_SWITCH = 18;

const SNAP_DISTANCE = 40; // px — how close to a dock zone to snap
const DOCK_MARGIN = 8; // px padding from edges

/** Compute dock zone coordinates for snapping */
function getDockZones(leftInset: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    'bottom-left':   { x: leftInset + DOCK_MARGIN, y: vh - CUBE_SIZE_IDLE - DOCK_MARGIN },
    'bottom-right':  { x: vw - CUBE_SIZE_IDLE - DOCK_MARGIN, y: vh - CUBE_SIZE_IDLE - DOCK_MARGIN },
    'bottom-center': { x: vw / 2 - HALF_IDLE, y: vh - CUBE_SIZE_IDLE - DOCK_MARGIN },
    'top-left':      { x: leftInset + DOCK_MARGIN, y: DOCK_MARGIN },
    'top-right':     { x: vw - CUBE_SIZE_IDLE - DOCK_MARGIN, y: DOCK_MARGIN },
  } as Record<CubeDockPosition, { x: number; y: number }>;
}

function findNearestDock(pos: { x: number; y: number }, leftInset: number): CubeDockPosition {
  const zones = getDockZones(leftInset);
  let nearest: CubeDockPosition = 'floating';
  let minDist = SNAP_DISTANCE;
  for (const [id, zonePos] of Object.entries(zones)) {
    const dx = pos.x - zonePos.x;
    const dy = pos.y - zonePos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < minDist) {
      minDist = dist;
      nearest = id as CubeDockPosition;
    }
  }
  return nearest;
}

export function MinimizedPanelStack({
  panelCubes,
  registry = cubeFaceRegistry,
  instanceId = 'default',
}: MinimizedPanelStackProps) {
  // Subscribe to registry changes so face additions/removals re-render
  useSyncExternalStore(registry.subscribe, registry.getSnapshot);

  const settingsStore = useMemo(() => getCubeSettingsStore(instanceId), [instanceId]);

  const indicatorRef = useRef<HTMLDivElement>(null);
  const leftInset = useInsetOn('left');
  const dockPosition = settingsStore((s) => s.dockPosition);
  const setDockPosition = settingsStore((s) => s.setDockPosition);

  // ── Registry-derived face arrays (stable across renders unless registry changes) ──
  const registryRevision = registry.getSnapshot();
  const yFaces = useMemo(() => registry.getEquatorial(), [registry, registryRevision]);
  const topFace = useMemo(() => registry.getTop(), [registry, registryRevision]);
  const bottomFace = useMemo(() => registry.getBottom(), [registry, registryRevision]);

  const yFaceIndex = useCallback(
    (id: string) => { const idx = yFaces.findIndex((f) => f.id === id); return idx >= 0 ? idx : 0; },
    [yFaces],
  );
  const isEquatorial = useCallback(
    (id: string) => yFaces.some((f) => f.id === id),
    [yFaces],
  );

  // Position — either from dock zone or free-floating
  const [floatingPos, setFloatingPos] = useState(() => ({
    x: window.innerWidth / 2 - HALF_IDLE,
    y: window.innerHeight - 80,
  }));

  const position = useMemo(() => {
    if (dockPosition === 'floating') return floatingPos;
    const zones = getDockZones(leftInset);
    return zones[dockPosition] ?? floatingPos;
  }, [dockPosition, floatingPos, leftInset]);

  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [hoverTilt, setHoverTilt] = useState({ x: 0, y: 0 });
  // Cumulative rotations — separate axes so they don't interfere
  const [faceRotationY, setFaceRotationY] = useState(() => {
    const face = settingsStore.getState().activeFace;
    return isEquatorial(face) ? yFaceIndex(face) * -90 : 0;
  });
  const [faceRotationX, setFaceRotationX] = useState(() => {
    const face = settingsStore.getState().activeFace;
    return face === topFace?.id ? 90 : face === bottomFace?.id ? -90 : 0;
  });
  const lastEquatorialRef = useRef<string>(yFaces[0]?.id ?? 'panels'); // remember which equatorial face to return to
  const activeFace = settingsStore((s) => s.activeFace);
  const setActiveFace = settingsStore((s) => s.setActiveFace);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  const [clickExpanded, setClickExpanded] = useState(false);
  const { isExpanded: hoverExpanded, handlers } = useHoverExpand({
    expandDelay: 400,
    collapseDelay: 250,
  });
  const isExpanded = clickExpanded || hoverExpanded;

  const restorePanelFromCube = useCubeStore((s) => s.restorePanelFromCube);
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);

  /** Restore a single cube — skips if a floating panel with the same definition is already open. */
  const handleRestore = useCallback(
    (cubeId: string) => {
      const panelData = restorePanelFromCube(cubeId);
      if (panelData) {
        // Guard: if a floating panel with the same definition is already open, just bring it to front
        const ws = useWorkspaceStore.getState();
        const existing = ws.floatingPanels.find(
          (p) => getFloatingDefinitionId(p.id) === panelData.panelId,
        );
        if (existing) {
          ws.bringFloatingPanelToFront(existing.id);
          return;
        }
        openFloatingPanel(panelData.panelId, {
          x: panelData.originalPosition.x,
          y: panelData.originalPosition.y,
          width: panelData.originalSize.width,
          height: panelData.originalSize.height,
          context: panelData.context,
        });
      }
    },
    [restorePanelFromCube, openFloatingPanel],
  );

  const handleRestoreAll = useCallback(() => {
    for (const cube of panelCubes) {
      const panelData = restorePanelFromCube(cube.id);
      if (panelData) {
        // Guard: skip if already open as floating (dedup across iterations too)
        const ws = useWorkspaceStore.getState();
        const existing = ws.floatingPanels.find(
          (p) => getFloatingDefinitionId(p.id) === panelData.panelId,
        );
        if (existing) {
          ws.bringFloatingPanelToFront(existing.id);
          continue;
        }
        openFloatingPanel(panelData.panelId, {
          x: panelData.originalPosition.x,
          y: panelData.originalPosition.y,
          width: panelData.originalSize.width,
          height: panelData.originalSize.height,
          context: panelData.context,
        });
      }
    }
  }, [panelCubes, restorePanelFromCube, openFloatingPanel]);

  const removeCube = useCubeStore((s) => s.removeCube);

  const handleClearAll = useCallback(() => {
    for (const cube of panelCubes) {
      removeCube(cube.id);
    }
  }, [panelCubes, removeCube]);

  const cycleFace = useCallback(
    (direction: 1 | -1, axis: 'x' | 'y' = 'y') => {
      if (axis === 'y') {
        // Horizontal: cycle equatorial ring
        // If currently on top/bottom, return to equatorial first
        if (!isEquatorial(activeFace)) {
          setFaceRotationX(0);
          setActiveFace(lastEquatorialRef.current);
          return;
        }
        const idx = yFaceIndex(activeFace);
        const next = (idx + direction + yFaces.length) % yFaces.length;
        setFaceRotationY((prev) => prev + direction * -90);
        setActiveFace(yFaces[next].id);
        lastEquatorialRef.current = yFaces[next].id;
      } else {
        // Vertical: toggle between equatorial ↔ top/bottom
        const topId = topFace?.id;
        const bottomId = bottomFace?.id;
        if (isEquatorial(activeFace)) {
          lastEquatorialRef.current = activeFace;
          if (direction > 0) {
            setFaceRotationX((prev) => prev + 90);
            if (topId) setActiveFace(topId);
          } else {
            setFaceRotationX((prev) => prev - 90);
            if (bottomId) setActiveFace(bottomId);
          }
        } else if (activeFace === topId) {
          if (direction > 0) {
            setFaceRotationX((prev) => prev + 90);
            if (bottomId) setActiveFace(bottomId);
          } else {
            setFaceRotationX((prev) => prev - 90);
            setActiveFace(lastEquatorialRef.current);
          }
        } else {
          // bottom
          if (direction < 0) {
            setFaceRotationX((prev) => prev - 90);
            if (topId) setActiveFace(topId);
          } else {
            setFaceRotationX((prev) => prev + 90);
            setActiveFace(lastEquatorialRef.current);
          }
        }
      }
    },
    [activeFace, setActiveFace, isEquatorial, yFaceIndex, yFaces, topFace, bottomFace],
  );

  // Stable ref so repeat timers always call the latest cycleFace
  const cycleFaceRef = useRef(cycleFace);
  cycleFaceRef.current = cycleFace;

  // Note: no auto-rotate when panels face empties — let the user stay on the face
  // they chose and rotate manually if desired.

  // ── Drag + click + dock snap ──
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      hasMoved.current = false;
      // Undock on drag start so position updates go to floatingPos
      if (dockPosition !== 'floating') {
        setFloatingPos(position);
        setDockPosition('floating');
      }
      setIsDragging(true);
    },
    [position, dockPosition, setDockPosition],
  );

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasMoved.current = true;
      setFloatingPos({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };
    const handleUp = () => {
      setIsDragging(false);
      if (!hasMoved.current) {
        const absY = Math.abs(hoverTilt.y);
        const absX = Math.abs(hoverTilt.x);
        if (Math.max(absY, absX) > TILT_SWITCH) {
          if (absY >= absX) {
            cycleFace(hoverTilt.y > 0 ? -1 : 1, 'y');
          } else {
            cycleFace(hoverTilt.x < 0 ? -1 : 1, 'x');
          }
          // Clear stale tilt so peekedFace doesn't highlight the next neighbor
          // using the old tilt value + new activeFace.
          setHoverTilt({ x: 0, y: 0 });
        } else {
          setClickExpanded((v) => !v);
        }
      } else {
        // Try to snap to nearest dock zone
        const snap = findNearestDock(floatingPos, leftInset);
        if (snap !== 'floating') {
          setDockPosition(snap);
        }
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, cycleFace, hoverTilt.y, floatingPos, leftInset, setDockPosition]);

  // ── Hover tilt + auto-rotate when held at edge ──
  const AUTO_ROTATE_THRESHOLD = 0.88;
  const AUTO_ROTATE_HOLD_MS = 350; // how long to hold at edge before first rotate
  const AUTO_ROTATE_REPEAT_MS = 500; // interval for repeated rotation while held
  const autoRotateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRotateDirection = useRef<1 | -1 | null>(null);

  // Clear auto-rotate timer on unmount or when leaving
  const clearAutoRotate = useCallback(() => {
    if (autoRotateTimer.current) {
      clearTimeout(autoRotateTimer.current);
      autoRotateTimer.current = null;
    }
    autoRotateDirection.current = null;
  }, []);

  const handleHoverMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) return;
      const rect = indicatorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const nx = Math.max(-1.2, Math.min(1.2, (e.clientX - cx) / (rect.width / 2)));
      const ny = Math.max(-1.2, Math.min(1.2, (e.clientY - cy) / (rect.height / 2)));

      const tiltX = Math.sign(ny) * Math.pow(Math.min(Math.abs(ny), 1), 1.3) * TILT_MAX;
      const tiltY = -Math.sign(nx) * Math.pow(Math.min(Math.abs(nx), 1), 1.3) * TILT_MAX;
      setHoverTilt({ x: tiltX, y: tiltY });

      // Auto-rotate: hold at any edge → rotate after delay, repeat while held
      const absNx = Math.abs(nx);
      const absNy = Math.abs(ny);
      const edgeMax = Math.max(absNx, absNy);

      if (edgeMax >= AUTO_ROTATE_THRESHOLD) {
        const isHorizontal = absNx >= absNy;
        const dir: 1 | -1 = isHorizontal
          ? (nx > 0 ? 1 : -1)
          : (ny < 0 ? -1 : 1);
        const axis: 'x' | 'y' = isHorizontal ? 'y' : 'x';
        // Encode direction+axis as a unique key so left/right/up/down don't share
        const dirKey = `${axis}${dir}` as any;

        if (dirKey !== autoRotateDirection.current) {
          clearAutoRotate();
          autoRotateDirection.current = dirKey;
          // Use refs for the repeat timer so it always calls the latest cycleFace
          const doRotate = () => {
            cycleFaceRef.current(dir, axis);
            setHoverTilt({ x: 0, y: 0 });
            autoRotateTimer.current = setTimeout(doRotate, AUTO_ROTATE_REPEAT_MS);
          };
          autoRotateTimer.current = setTimeout(doRotate, AUTO_ROTATE_HOLD_MS);
        }
      } else if (edgeMax < 0.6) {
        clearAutoRotate();
      }
    },
    [isDragging, cycleFace, clearAutoRotate],
  );

  const handleHoverEnter = useCallback(() => {
    setIsHovered(true);
    handlers.onMouseEnter();
  }, [handlers]);

  const handleHoverLeave = useCallback(() => {
    setIsHovered(false);
    setHoverTilt({ x: 0, y: 0 });
    setClickExpanded(false);
    clearAutoRotate();
    handlers.onMouseLeave();
  }, [handlers, clearAutoRotate]);

  const cubeSize = isExpanded ? CUBE_SIZE_ACTIVE : CUBE_SIZE_IDLE;
  const half = isExpanded ? HALF_ACTIVE : HALF_IDLE;

  // Highlight: external hover from CubeHeaderChips triggers nudge animation
  const isHighlighted = useCubeHighlightStore(
    (s) => s.highlightedInstanceId === instanceId,
  );

  // Priority: drag > highlight > expanded > hover > idle wobble
  const animClass = isDragging ? ''
    : isHighlighted ? 'animate-cube-nudge'
    : isExpanded ? ''
    : isHovered ? 'animate-cube-bounce'
    : 'animate-cube-wobble';

  // Determine which face the tilt is peeking toward (for highlight).
  // The rotation direction is fixed: tiltX<0 (mouse up) → dir=1, tiltX>0 → dir=-1.
  // From each face, dir maps to a specific destination. Show that destination.
  const absY = Math.abs(hoverTilt.y);
  const absX = Math.abs(hoverTilt.x);
  const peekedFace: string | null = (() => {
    if (Math.max(absY, absX) < 12) return null;
    if (absY >= absX) {
      return hoverTilt.y < 0 ? 'right' : 'left';
    }
    // Vertical highlight: the navigation labels ('top'/'bottom' on activeFace)
    // are inverted relative to the face *elements* in the DOM because of the
    // CSS 3D transform geometry — rotateX(+90) visually brings the bottom
    // element forward.  So the peek highlight must target the opposite element.
    const down = hoverTilt.x > 0;
    if (activeFace === topFace?.id) return down ? 'top' : null;
    if (activeFace === bottomFace?.id) return down ? null : 'bottom';
    return down ? 'bottom' : 'top';
  })();

  // ── Context for face components ──
  const ctxValue = useMemo(() => ({
    cubeInstanceId: instanceId,
    panelCubes,
    onRestore: handleRestore,
    onRestoreAll: handleRestoreAll,
    onClearAll: handleClearAll,
    registry,
  }), [instanceId, panelCubes, handleRestore, handleRestoreAll, handleClearAll, registry]);

  const content = (
    <div
      className="pointer-events-auto floating-panel-cube-target"
      data-cube-instance={instanceId}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: Z.floatOverlay,
        transition: isDragging ? 'none' : 'left 300ms ease, top 300ms ease',
      }}
    >
      {/* ── 3D Cube ── */}
      <div
        ref={indicatorRef}
        className={`relative ${animClass}`}
        style={{ width: cubeSize, height: cubeSize, transition: 'width 300ms ease, height 300ms ease' }}
      >
        {/* Visual layer — pointer-events disabled so hit-test uses the flat rect below */}
        <div className="absolute inset-0" style={{ perspective: 150, pointerEvents: 'none' }}>
          {/* Outer: X-axis rotation (vertical face switching + tilt) */}
          <div
            className="w-full h-full"
            style={{
              transformStyle: 'preserve-3d',
              transform: `rotateX(${faceRotationX + hoverTilt.x}deg)`,
              transition: isDragging ? 'none' : 'transform 300ms cubic-bezier(.25,.1,.25,1)',
            }}
          >
          {/* Inner: Y-axis rotation (horizontal face switching + tilt) */}
          <div
            className="w-full h-full relative"
            style={{
              transformStyle: 'preserve-3d',
              transform: `rotateY(${faceRotationY + hoverTilt.y}deg)`,
              transition: isDragging ? 'none' : 'transform 300ms cubic-bezier(.25,.1,.25,1)',
            }}
          >
            {/* Equatorial faces (Y-axis) — from registry */}
            {yFaces.map((face, i) => {
              const isActive = activeFace === face.id;
              const eqIdx = isEquatorial(activeFace) ? yFaceIndex(activeFace) : yFaceIndex(lastEquatorialRef.current);
              const isPeeked = peekedFace === 'right' && i === (eqIdx + 1) % yFaces.length
                || peekedFace === 'left' && i === (eqIdx + yFaces.length - 1) % yFaces.length;
              const transforms = [
                `translateZ(${half}px)`,
                `translateX(${half}px) rotateY(90deg)`,
                `translateZ(-${half}px) rotateY(180deg)`,
                `translateX(-${half}px) rotateY(-90deg)`,
              ];
              return (
                <CubeFace key={face.id} transform={transforms[i]} active={isActive} peeked={isPeeked} expanded={isExpanded}>
                  <Icon name={face.icon} size={isExpanded ? 20 : 16} />
                  {isExpanded && <span className="text-[8px] mt-0.5">{face.label}</span>}
                </CubeFace>
              );
            })}
            {/* Top face — from registry */}
            {topFace && (
              <CubeFace transform={`translateY(-${half}px) rotateX(90deg)`} active={activeFace === topFace.id} peeked={peekedFace === 'top'} expanded={isExpanded}>
                <Icon name={topFace.icon} size={isExpanded ? 20 : 16} />
                {isExpanded && <span className="text-[8px] mt-0.5">{topFace.label}</span>}
              </CubeFace>
            )}
            {/* Bottom face — from registry */}
            {bottomFace && (
              <CubeFace transform={`translateY(${half}px) rotateX(-90deg)`} active={activeFace === bottomFace.id} peeked={peekedFace === 'bottom'} expanded={isExpanded}>
                <Icon name={bottomFace.icon} size={isExpanded ? 20 : 16} />
                {isExpanded && <span className="text-[8px] mt-0.5">{bottomFace.label}</span>}
              </CubeFace>
            )}
          </div>
          </div>
        </div>

        {/* Hit area — slightly larger than cube for easier edge hovering */}
        <div
          className="absolute -inset-2 cursor-grab select-none z-10"
          onMouseDown={handleMouseDown}
          onMouseMove={(e) => { handleHoverMove(e); if (!isDragging) handleHoverEnter(); }}
          onMouseLeave={handleHoverLeave}
        />

        {/* Count badge — hidden when no panels */}
        {panelCubes.length > 0 && (
          <div className={`absolute -top-1 -right-1 rounded-full bg-cyan-500 text-white font-bold flex items-center justify-center shadow-md z-20 transition-all duration-300 ${
            isExpanded ? 'min-w-[20px] h-5 text-[11px] px-1' : 'min-w-[16px] h-4 text-[9px] px-0.5'
          }`}>
            {panelCubes.length}
          </div>
        )}
      </div>

      {/* ── Face content (portaled, dynamic from registry) ── */}
      {isExpanded && (() => {
        const faceDef = registry.get(activeFace);
        if (!faceDef) return null;
        const FaceComponent = faceDef.component;
        if (FaceComponent) {
          return (
            <PortalFloat anchor={indicatorRef.current} placement="top" align="center" offset={8} clamp
              className={faceDef.portalClassName}
              style={{ zIndex: Z.floatOverlayPopover }} onMouseEnter={handlers.onMouseEnter} onMouseLeave={handlers.onMouseLeave}>
              <FaceComponent cubeInstanceId={instanceId} isExpanded={isExpanded} />
            </PortalFloat>
          );
        }
        if (faceDef.placeholder) {
          return (
            <PortalFloat anchor={indicatorRef.current} placement="top" align="center" offset={8} clamp
              className="bg-neutral-900/95 backdrop-blur-md border border-neutral-700 rounded-lg shadow-2xl px-4 py-3"
              style={{ zIndex: Z.floatOverlayPopover }} onMouseEnter={handlers.onMouseEnter} onMouseLeave={handlers.onMouseLeave}>
              <div className="text-[11px] text-neutral-500 text-center">
                {faceDef.placeholder}
              </div>
            </PortalFloat>
          );
        }
        return null;
      })()}
    </div>
  );

  return (
    <CubeIndicatorContext.Provider value={ctxValue}>
      {content}
    </CubeIndicatorContext.Provider>
  );
}

// ── Cube Face ──

function CubeFace({ transform, active, peeked, expanded, children }: {
  transform: string; active?: boolean; peeked?: boolean; expanded?: boolean; children: React.ReactNode;
}) {
  const bg = peeked
    ? 'bg-neutral-700/90 border-cyan-400/40'
    : active && expanded
      ? 'bg-neutral-800/95 border-cyan-400/60 shadow-lg shadow-cyan-500/20'
      : active
        ? 'bg-neutral-800/90 border-cyan-400/30'
        : 'bg-neutral-800/80 border-neutral-600/30';
  const text = peeked ? 'text-cyan-300' : active ? 'text-cyan-400' : 'text-neutral-500';
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center rounded-sm border backdrop-blur-md transition-colors duration-200 ${bg}`}
      style={{ transform, backfaceVisibility: 'hidden' }}
    >
      <div className={`flex flex-col items-center ${text}`}>{children}</div>
    </div>
  );
}

// ── NOTE: PanelsCarousel, QuickLauncher, and CarouselItem have been
// extracted to components/faces/ and are now loaded via the CubeFaceRegistry. ──

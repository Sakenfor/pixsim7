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
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

import { Icon } from '@lib/icons';
import { useInsetOn } from '@lib/layout/edgeInsets';
import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { useWorkspaceStore } from '@features/workspace';
import { openWorkspacePanel } from '@features/workspace';
import { getFloatingDefinitionId } from '@features/workspace/lib/floatingPanelUtils';

import { useCubeSettingsStore, type CubeFaceMode, type CubeDockPosition } from '../stores/cubeSettingsStore';
import { useCubeStore, type ControlCube } from '../useCubeStore';

interface MinimizedPanelStackProps {
  panelCubes: ControlCube[];
}

// ── Face definitions ──

// Equatorial ring (Y-axis rotation): 4 faces
const Y_FACES: { mode: CubeFaceMode; icon: string; label: string }[] = [
  { mode: 'panels',   icon: 'layoutGrid', label: 'Panels' },
  { mode: 'launcher', icon: 'zap',        label: 'Launch' },
  { mode: 'pinned',   icon: 'pin',        label: 'Pinned' },
  { mode: 'recent',   icon: 'clock',      label: 'Recent' },
];

// Vertical faces (X-axis rotation)
const TOP_FACE:    { mode: CubeFaceMode; icon: string; label: string } = { mode: 'top',    icon: 'star',     label: 'Favorites' };
const BOTTOM_FACE: { mode: CubeFaceMode; icon: string; label: string } = { mode: 'bottom', icon: 'settings', label: 'Settings' };

function yFaceIndex(mode: CubeFaceMode): number {
  const idx = Y_FACES.findIndex((f) => f.mode === mode);
  return idx >= 0 ? idx : 0;
}

function isEquatorial(mode: CubeFaceMode): boolean {
  return Y_FACES.some((f) => f.mode === mode);
}

// ── Helpers ──

function getPanelMeta(panelId: string) {
  const defId = getFloatingDefinitionId(panelId);
  const def = panelSelectors.get(defId);
  return { title: def?.title ?? defId, icon: def?.icon ?? 'layoutGrid' };
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

export function MinimizedPanelStack({ panelCubes }: MinimizedPanelStackProps) {
  const indicatorRef = useRef<HTMLDivElement>(null);
  const leftInset = useInsetOn('left');
  const dockPosition = useCubeSettingsStore((s) => s.dockPosition);
  const setDockPosition = useCubeSettingsStore((s) => s.setDockPosition);

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
    const face = useCubeSettingsStore.getState().activeFace;
    return isEquatorial(face) ? yFaceIndex(face) * -90 : 0;
  });
  const [faceRotationX, setFaceRotationX] = useState(() => {
    const face = useCubeSettingsStore.getState().activeFace;
    return face === 'top' ? 90 : face === 'bottom' ? -90 : 0;
  });
  const lastEquatorialRef = useRef<CubeFaceMode>('panels'); // remember which equatorial face to return to
  const activeFace = useCubeSettingsStore((s) => s.activeFace);
  const setActiveFace = useCubeSettingsStore((s) => s.setActiveFace);
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
    },
    [restorePanelFromCube, openFloatingPanel],
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
        const next = (idx + direction + Y_FACES.length) % Y_FACES.length;
        setFaceRotationY((prev) => prev + direction * -90);
        setActiveFace(Y_FACES[next].mode);
        lastEquatorialRef.current = Y_FACES[next].mode;
      } else {
        // Vertical: toggle between equatorial ↔ top/bottom
        if (isEquatorial(activeFace)) {
          // From equatorial → go to top (up) or bottom (down)
          lastEquatorialRef.current = activeFace;
          if (direction > 0) {
            setFaceRotationX((prev) => prev + 90);
            setActiveFace('top');
          } else {
            setFaceRotationX((prev) => prev - 90);
            setActiveFace('bottom');
          }
        } else if (activeFace === 'top') {
          if (direction > 0) {
            // Continue up past top → go to bottom (full rotation)
            setFaceRotationX((prev) => prev + 90);
            setActiveFace('bottom');
          } else {
            // Come back down to equatorial
            setFaceRotationX((prev) => prev - 90);
            setActiveFace(lastEquatorialRef.current);
          }
        } else {
          // bottom
          if (direction < 0) {
            setFaceRotationX((prev) => prev - 90);
            setActiveFace('top');
          } else {
            setFaceRotationX((prev) => prev + 90);
            setActiveFace(lastEquatorialRef.current);
          }
        }
      }
    },
    [activeFace, setActiveFace],
  );

  // Stable ref so repeat timers always call the latest cycleFace
  const cycleFaceRef = useRef(cycleFace);
  cycleFaceRef.current = cycleFace;

  // Auto-rotate away from panels face when no panels left
  const prevCountRef = useRef(panelCubes.length);
  useEffect(() => {
    if (prevCountRef.current > 0 && panelCubes.length === 0 && activeFace === 'panels') {
      cycleFace(1, 'y');
    }
    prevCountRef.current = panelCubes.length;
  }, [panelCubes.length, activeFace, cycleFace]);

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
            cycleFace(hoverTilt.x < 0 ? 1 : -1, 'x');
          }
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
          : (ny < 0 ? 1 : -1);
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

  // Idle: wobble. Hover (not expanded yet): double-bounce. Expanded: nothing.
  const animClass = isDragging ? ''
    : isExpanded ? ''
    : isHovered ? 'animate-cube-bounce'
    : 'animate-cube-wobble';

  // Determine which face the tilt is peeking toward (for highlight)
  const absY = Math.abs(hoverTilt.y);
  const absX = Math.abs(hoverTilt.x);
  const peekedFace: string | null =
    Math.max(absY, absX) < 12 ? null // not tilted enough
    : absY >= absX
      ? (hoverTilt.y < 0 ? 'right' : 'left') // tilt reveals the face in that direction
      : (hoverTilt.x < 0 ? 'top' : 'bottom');

  return (
    <div
      className="pointer-events-auto"
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
            {/* 4 equatorial faces (Y-axis) */}
            {Y_FACES.map((face, i) => {
              const isActive = activeFace === face.mode;
              // Determine if this face is being peeked at via tilt
              const eqIdx = isEquatorial(activeFace) ? yFaceIndex(activeFace) : yFaceIndex(lastEquatorialRef.current);
              const isPeeked = peekedFace === 'right' && i === (eqIdx + 1) % 4
                || peekedFace === 'left' && i === (eqIdx + 3) % 4;
              const transforms = [
                `translateZ(${half}px)`,
                `translateX(${half}px) rotateY(90deg)`,
                `translateZ(-${half}px) rotateY(180deg)`,
                `translateX(-${half}px) rotateY(-90deg)`,
              ];
              return (
                <CubeFace key={face.mode} transform={transforms[i]} active={isActive} peeked={isPeeked} expanded={isExpanded}>
                  <Icon name={face.icon} size={isExpanded ? 20 : 16} />
                  {isExpanded && <span className="text-[8px] mt-0.5">{face.label}</span>}
                </CubeFace>
              );
            })}
            {/* Top face */}
            <CubeFace transform={`translateY(-${half}px) rotateX(90deg)`} active={activeFace === 'top'} peeked={peekedFace === 'top'} expanded={isExpanded}>
              <Icon name={TOP_FACE.icon} size={isExpanded ? 20 : 16} />
              {isExpanded && <span className="text-[8px] mt-0.5">{TOP_FACE.label}</span>}
            </CubeFace>
            {/* Bottom face */}
            <CubeFace transform={`translateY(${half}px) rotateX(-90deg)`} active={activeFace === 'bottom'} peeked={peekedFace === 'bottom'} expanded={isExpanded}>
              <Icon name={BOTTOM_FACE.icon} size={isExpanded ? 20 : 16} />
              {isExpanded && <span className="text-[8px] mt-0.5">{BOTTOM_FACE.label}</span>}
            </CubeFace>
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

      {/* ── Face content (portaled) ── */}
      {isExpanded && activeFace === 'panels' && (
        <PortalFloat anchor={indicatorRef.current} placement="top" align="center" offset={8} clamp
          style={{ zIndex: Z.floatOverlayPopover }} onMouseEnter={handlers.onMouseEnter} onMouseLeave={handlers.onMouseLeave}>
          <PanelsCarousel panelCubes={panelCubes} onRestore={handleRestore} onRestoreAll={handleRestoreAll} onClearAll={handleClearAll} />
        </PortalFloat>
      )}

      {isExpanded && activeFace === 'launcher' && (
        <PortalFloat anchor={indicatorRef.current} placement="top" align="center" offset={8} clamp
          className="bg-neutral-900/95 backdrop-blur-md border border-neutral-700 rounded-lg shadow-2xl overflow-hidden"
          style={{ zIndex: Z.floatOverlayPopover }} onMouseEnter={handlers.onMouseEnter} onMouseLeave={handlers.onMouseLeave}>
          <QuickLauncher />
        </PortalFloat>
      )}

      {isExpanded && (activeFace === 'pinned' || activeFace === 'recent' || activeFace === 'top' || activeFace === 'bottom') && (
        <PortalFloat anchor={indicatorRef.current} placement="top" align="center" offset={8} clamp
          className="bg-neutral-900/95 backdrop-blur-md border border-neutral-700 rounded-lg shadow-2xl px-4 py-3"
          style={{ zIndex: Z.floatOverlayPopover }} onMouseEnter={handlers.onMouseEnter} onMouseLeave={handlers.onMouseLeave}>
          <div className="text-[11px] text-neutral-500 text-center">
            {activeFace === 'pinned' && 'Pinned items — coming soon'}
            {activeFace === 'recent' && 'Recent history — coming soon'}
            {activeFace === 'top' && 'Favorites — coming soon'}
            {activeFace === 'bottom' && 'Settings — coming soon'}
          </div>
        </PortalFloat>
      )}
    </div>
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

// ── Quick Launcher ──

function QuickLauncher() {
  const panels = useMemo(() => panelSelectors.getPublicPanels().slice(0, 12), []);

  return (
    <div className="p-2 w-[200px]">
      <div className="px-1 pb-1.5 text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
        Quick Launch
      </div>
      <div className="grid grid-cols-3 gap-1">
        {panels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            onClick={() => openWorkspacePanel(panel.id)}
            className="flex flex-col items-center gap-1 px-1 py-2 rounded-md text-neutral-300 hover:bg-cyan-600/20 hover:text-cyan-300 transition-colors"
            title={panel.title}
          >
            <Icon name={panel.icon ?? 'layoutGrid'} size={16} className="shrink-0" />
            <span className="text-[9px] truncate w-full text-center">{panel.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Panels Carousel (arc) ──

const ITEM_SIZE = 44;
const ARC_RADIUS = 110;
const ARC_SPAN = (160 * Math.PI) / 180;
const MAX_VISIBLE = 7;
const DRAG_OUT_THRESHOLD = 60;

function arcPos(angle: number) {
  return { x: Math.sin(angle) * ARC_RADIUS, y: -Math.cos(angle) * ARC_RADIUS };
}

function PanelsCarousel({ panelCubes, onRestore, onRestoreAll, onClearAll }: {
  panelCubes: ControlCube[]; onRestore: (id: string) => void; onRestoreAll: () => void; onClearAll: () => void;
}) {
  const count = panelCubes.length;
  const [focusIndex, setFocusIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(count);
  countRef.current = count;

  useEffect(() => {
    if (focusIndex >= count) setFocusIndex(Math.max(0, count - 1));
  }, [count, focusIndex]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const c = countRef.current;
      setFocusIndex((prev) => {
        if (e.deltaY > 0 || e.deltaX > 0) return Math.min(prev + 1, c - 1);
        if (e.deltaY < 0 || e.deltaX < 0) return Math.max(prev - 1, 0);
        return prev;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const focusedMeta = panelCubes[focusIndex]?.minimizedPanel
    ? getPanelMeta(panelCubes[focusIndex].minimizedPanel!.panelId) : null;

  const sideCount = Math.floor(MAX_VISIBLE / 2);
  const angleStep = count > 1 ? ARC_SPAN / Math.min(MAX_VISIBLE - 1, count - 1) : 0;
  const containerW = ARC_RADIUS * 2 + ITEM_SIZE + 20;
  const containerH = ARC_RADIUS + ITEM_SIZE / 2 + 4;
  const cx = containerW / 2;
  const cy = containerH;

  return (
    <div ref={containerRef} className="flex flex-col items-center">
      <div className="text-[11px] text-neutral-300 font-medium truncate max-w-[220px] text-center px-2 mb-2">
        {focusedMeta?.title ?? panelCubes[focusIndex]?.id ?? ''}
      </div>
      <div className="relative" style={{ width: containerW, height: containerH }}>
        {panelCubes.map((cube, i) => {
          const offset = i - focusIndex;
          if (Math.abs(offset) > sideCount) return null;
          const meta = cube.minimizedPanel ? getPanelMeta(cube.minimizedPanel.panelId) : null;
          const isFocused = offset === 0;
          const absOffset = Math.abs(offset);
          const angle = offset * angleStep;
          const { x, y } = arcPos(angle);
          const t = absOffset / Math.max(sideCount, 1);
          const scale = isFocused ? 1 : Math.max(0.65, 1 - t * 0.3);
          const opacity = isFocused ? 1 : Math.max(0.25, 1 - t * 0.55);

          return (
            <CarouselItem key={cube.id} cubeId={cube.id} icon={meta?.icon ?? 'layoutGrid'}
              title={meta?.title ?? cube.id} isFocused={isFocused}
              style={{
                position: 'absolute', left: cx + x - ITEM_SIZE / 2, top: cy + y - ITEM_SIZE / 2,
                width: ITEM_SIZE, height: ITEM_SIZE, transform: `scale(${scale})`,
                opacity, zIndex: isFocused ? 10 : 10 - absOffset, transition: 'all 250ms ease-out',
              }}
              onRestore={onRestore} onFocus={() => setFocusIndex(i)} />
          );
        })}
        {count > 1 && panelCubes.map((_, i) => {
          const offset = i - focusIndex;
          if (Math.abs(offset) > sideCount + 1) return null;
          const angle = offset * angleStep;
          const dotR = ARC_RADIUS + ITEM_SIZE / 2 + 8;
          const dx = Math.sin(angle) * dotR;
          const dy = -Math.cos(angle) * dotR;
          const dotOpacity = i === focusIndex ? 1 : Math.max(0.2, 1 - (Math.abs(offset) / Math.max(sideCount + 1, 1)) * 0.6);
          return (
            <button key={`dot-${i}`} type="button" onClick={() => setFocusIndex(i)}
              className={`absolute w-2 h-2 rounded-full transition-all ${i === focusIndex ? 'bg-cyan-400 scale-125' : 'bg-neutral-600 hover:bg-neutral-500'}`}
              style={{ left: cx + dx - 4, top: cy + dy - 4, opacity: dotOpacity, transition: 'all 250ms ease-out' }} />
          );
        })}
      </div>
      {count > 0 && (
        <div className="flex items-center gap-1.5 mt-1">
          {count > 1 && (
            <button type="button" onClick={onRestoreAll} title="Restore all panels"
              className="w-6 h-6 flex items-center justify-center rounded-md text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/10 transition-colors">
              <Icon name="maximize2" size={12} />
            </button>
          )}
          <button type="button" onClick={onClearAll} title="Dismiss all"
            className="w-6 h-6 flex items-center justify-center rounded-md text-neutral-500 hover:text-red-400 hover:bg-red-400/10 transition-colors">
            <Icon name="trash2" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Carousel Item ──

function CarouselItem({ cubeId, icon, title, isFocused, style, onRestore, onFocus }: {
  cubeId: string; icon: string; title: string; isFocused: boolean;
  style: React.CSSProperties; onRestore: (id: string) => void; onFocus: () => void;
}) {
  const [dragDelta, setDragDelta] = useState<{ x: number; y: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const isDraggingOut = dragDelta != null && Math.sqrt(dragDelta.x ** 2 + dragDelta.y ** 2) > DRAG_OUT_THRESHOLD;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragStart.current = { x: e.clientX, y: e.clientY };
    const handleMove = (me: MouseEvent) => {
      if (!dragStart.current) return;
      setDragDelta({ x: me.clientX - dragStart.current.x, y: me.clientY - dragStart.current.y });
    };
    const handleUp = (me: MouseEvent) => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      if (!dragStart.current) return;
      const dist = Math.sqrt((me.clientX - dragStart.current.x) ** 2 + (me.clientY - dragStart.current.y) ** 2);
      dragStart.current = null;
      setDragDelta(null);
      if (dist > DRAG_OUT_THRESHOLD) onRestore(cubeId);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [cubeId, onRestore]);

  const itemStyle: React.CSSProperties = { ...style };
  if (dragDelta) {
    itemStyle.transform = `${style.transform ?? ''} translate(${dragDelta.x}px, ${dragDelta.y}px)`;
    itemStyle.transition = 'none';
  }

  return (
    <button type="button" style={itemStyle}
      onClick={(e) => { e.stopPropagation(); if (isFocused) { onRestore(cubeId); } else { onFocus(); } }}
      onMouseDown={handleMouseDown}
      className={`flex items-center justify-center rounded-xl backdrop-blur-md border shadow-lg cursor-grab transition-colors duration-150
        ${isFocused ? 'bg-neutral-800/95 border-cyan-400/60 shadow-cyan-500/20' : 'bg-neutral-800/80 border-neutral-600/40 hover:border-neutral-500/60'}
        ${isDraggingOut ? 'ring-2 ring-red-400/60' : ''}`}
      title={isFocused ? `Click to restore "${title}"` : title}>
      <Icon name={icon} size={isFocused ? 20 : 16}
        className={`transition-colors ${isFocused ? 'text-cyan-400' : 'text-neutral-400'}`} />
    </button>
  );
}

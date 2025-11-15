import { ReactNode, useEffect, useRef, useState } from 'react';
import { useControlCubeStore, type CubeType, type CubeFace } from '../../stores/controlCubeStore';
import { cubeExpansionRegistry } from '../../lib/cubeExpansionRegistry';
import { CubeExpansionOverlay } from './CubeExpansionOverlay';
import { clsx } from 'clsx';

export interface CubeFaceContent {
  front?: ReactNode;
  back?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  top?: ReactNode;
  bottom?: ReactNode;
}

export interface ControlCubeProps {
  cubeId: string;
  size?: number;
  faceContent?: CubeFaceContent;
  className?: string;
  onFaceClick?: (face: CubeFace) => void;
  onExpand?: (cubeId: string, position: { x: number; y: number }) => void;
}

const CUBE_TYPE_COLORS: Record<CubeType, string> = {
  control: 'bg-gradient-to-br from-blue-500/50 to-purple-500/50 border-blue-400/70',
  provider: 'bg-gradient-to-br from-green-500/50 to-teal-500/50 border-green-400/70',
  preset: 'bg-gradient-to-br from-orange-500/50 to-red-500/50 border-orange-400/70',
  panel: 'bg-gradient-to-br from-cyan-500/50 to-indigo-500/50 border-cyan-400/70',
  settings: 'bg-gradient-to-br from-gray-500/50 to-slate-500/50 border-gray-400/70',
  gallery: 'bg-gradient-to-br from-pink-500/50 to-violet-500/50 border-pink-400/70',
};

const CUBE_TYPE_GLOW: Record<CubeType, string> = {
  control: 'shadow-blue-500/50',
  provider: 'shadow-green-500/50',
  preset: 'shadow-orange-500/50',
  panel: 'shadow-cyan-500/50',
  settings: 'shadow-gray-500/50',
  gallery: 'shadow-pink-500/50',
};

const DEFAULT_FACE_CONTENT: CubeFaceContent = {
  front: '⚡',
  back: '🔧',
  left: '🎨',
  right: '📊',
  top: '⚙️',
  bottom: '🔍',
};

export function ControlCube({
  cubeId,
  size = 100,
  faceContent = DEFAULT_FACE_CONTENT,
  className,
  onFaceClick,
  onExpand,
}: ControlCubeProps) {
  const cubeRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cube = useControlCubeStore((s) => s.cubes[cubeId]);
  const updateCube = useControlCubeStore((s) => s.updateCube);
  const rotateCubeFace = useControlCubeStore((s) => s.rotateCubeFace);

  const [hoverTilt, setHoverTilt] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [hoveredFace, setHoveredFace] = useState<CubeFace | null>(null);
  const [showExpansion, setShowExpansion] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isNearEdge, setIsNearEdge] = useState(false);
  const [isDraggingEdge, setIsDraggingEdge] = useState(false);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  // Handle mouse move for hover tilt effect
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !cube) return;

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Calculate mouse position relative to cube center (-1 to 1)
    const x = (e.clientX - centerX) / (rect.width / 2);
    const y = (e.clientY - centerY) / (rect.height / 2);

    // Check if near edge (for drag-to-expand feature)
    const edgeThreshold = 0.7; // Within 30% of edge
    const nearEdge = Math.abs(x) > edgeThreshold || Math.abs(y) > edgeThreshold;
    setIsNearEdge(nearEdge);

    // Calculate distance from center (for front/back detection)
    const distance = Math.sqrt(x * x + y * y);

    // Determine which face is being hovered based on position and current rotation
    const absX = Math.abs(x);
    const absY = Math.abs(y);

    // Threshold for considering center (front/back faces)
    const centerThreshold = 0.3;

    let face: CubeFace;

    // If near center, determine front vs back based on rotation
    if (distance < centerThreshold) {
      // Near center - check rotation to determine if front or back is visible
      const rotY = cube.rotation.y % 360;
      const rotX = cube.rotation.x % 360;

      // Normalize to -180 to 180
      const normRotY = ((rotY + 180) % 360) - 180;
      const normRotX = ((rotX + 180) % 360) - 180;

      // If rotated significantly, back face is more visible
      if (Math.abs(normRotY) > 90 && Math.abs(normRotX) < 90) {
        face = 'back';
      } else if (Math.abs(normRotX) > 90 && Math.abs(normRotY) < 90) {
        face = 'back';
      } else {
        face = 'front';
      }
    }
    // Edges - detect which edge face
    else if (absX > absY) {
      // Horizontal edge
      face = x > 0 ? 'right' : 'left';
    } else {
      // Vertical edge
      face = y > 0 ? 'bottom' : 'top';
    }

    setHoveredFace(face);

    // Apply subtle tilt based on which face is hovered
    const tiltAmount = 15;

    // Adjust tilt based on face being hovered
    let tiltX = 0;
    let tiltY = 0;

    switch (face) {
      case 'front':
        // Slight tilt based on mouse position within center
        tiltX = -y * tiltAmount * 0.5;
        tiltY = x * tiltAmount * 0.5;
        break;
      case 'back':
        // Opposite tilt
        tiltX = y * tiltAmount * 0.5;
        tiltY = -x * tiltAmount * 0.5;
        break;
      case 'left':
        tiltY = -tiltAmount;
        tiltX = -y * tiltAmount * 0.3;
        break;
      case 'right':
        tiltY = tiltAmount;
        tiltX = -y * tiltAmount * 0.3;
        break;
      case 'top':
        // Hover top edge → tilt to reveal top side
        tiltX = tiltAmount;
        tiltY = x * tiltAmount * 0.3;
        break;
      case 'bottom':
        // Hover bottom edge → tilt to reveal bottom side
        tiltX = -tiltAmount;
        tiltY = x * tiltAmount * 0.3;
        break;
    }

    setHoverTilt({ x: tiltX, y: tiltY });
  };

  const handleMouseEnter = () => {
    setIsHovering(true);

    // Check if expansion provider exists
    const providerId = cube?.minimizedPanel?.panelId || cube?.type;
    if (!providerId) return;

    const provider = cubeExpansionRegistry.get(providerId);
    if (!provider || !provider.showOnHover) return;

    // Set timeout to show expansion after delay
    const delay = provider.hoverDelay || 300;
    hoverTimeoutRef.current = window.setTimeout(() => {
      setShowExpansion(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setHoverTilt({ x: 0, y: 0 });
    setHoveredFace(null);

    // Cancel expansion timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    // Hide expansion
    setShowExpansion(false);
  };

  // Mouse down - start drag tracking
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isNearEdge && e.shiftKey) {
      // Shift+drag from edge = expand to panel
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingEdge(true);
      dragStartPos.current = { x: e.clientX, y: e.clientY };
    } else {
      setDragStart({ x: e.clientX, y: e.clientY });
      setIsDragging(false);
    }
  };

  // Mouse up - handle click vs drag
  const handleMouseUp = (e: React.MouseEvent) => {
    // Handle edge drag to expand
    if (isDraggingEdge && dragStartPos.current) {
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // If dragged more than 30px, expand to panel
      if (distance > 30) {
        expandToPanel();
      }

      setIsDraggingEdge(false);
      dragStartPos.current = null;
      return;
    }

    if (!dragStart) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // If moved more than 10px, it's a drag - rotate to that direction
    if (distance > 10) {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      let targetFace: CubeFace;
      if (absX > absY) {
        targetFace = dx > 0 ? 'right' : 'left';
      } else {
        targetFace = dy > 0 ? 'bottom' : 'top';
      }

      rotateCubeFace(cubeId, targetFace);
    } else {
      // Small movement - treat as click
      if (hoveredFace) {
        onFaceClick?.(hoveredFace);
        updateCube(cubeId, { activeFace: hoveredFace });
      }
    }

    setDragStart(null);
    setIsDragging(false);
  };

  // Expand cube into a floating panel
  const expandToPanel = () => {
    if (!containerRef.current || !cube) return;

    // Get cube's current position
    const expandPosition = {
      x: cube.position.x,
      y: cube.position.y
    };

    // Notify parent to create panel
    onExpand?.(cubeId, expandPosition);
  };

  // Track dragging state
  const handleMouseMoveGlobal = (e: React.MouseEvent) => {
    if (dragStart) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 5) {
        setIsDragging(true);
      }
    }
    handleMouseMove(e);
  };

  useEffect(() => {
    if (!cube) return;

    // Animate rotation changes
    const cubeEl = cubeRef.current;
    if (cubeEl) {
      const baseRotation = cube.rotation;
      const tiltX = isHovering ? hoverTilt.x : 0;
      const tiltY = isHovering ? hoverTilt.y : 0;

      cubeEl.style.transform = `
        rotateX(${baseRotation.x + tiltX}deg)
        rotateY(${baseRotation.y + tiltY}deg)
        rotateZ(${baseRotation.z}deg)
      `;
    }
  }, [cube?.rotation, hoverTilt, isHovering]);

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  if (!cube) return null;

  const halfSize = size / 2;
  const colorClass = CUBE_TYPE_COLORS[cube.type];
  const glowClass = CUBE_TYPE_GLOW[cube.type];

  const isExpanded = cube.mode === 'expanded';
  const isCombined = cube.mode === 'combined';
  const isDocked = cube.mode === 'docked';

  const cubeScale = cube.scale * (isExpanded ? 1.5 : 1) * (isCombined ? 1.2 : 1);

  const renderFace = (face: CubeFace, content: ReactNode, transform: string) => {
    const isActive = cube.activeFace === face;

    return (
      <div
        className={clsx(
          'absolute flex items-center justify-center text-2xl',
          'border backdrop-blur-md transition-all duration-300',
          colorClass,
          isActive && 'border-white/70 shadow-lg',
          !isActive && 'hover:border-white/50',
          'select-none'
        )}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          transform,
          pointerEvents: 'none', // Let container handle all events
        }}
      >
        <div className="pointer-events-none">
          {content || DEFAULT_FACE_CONTENT[face]}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={clsx(
        'relative transition-all duration-300',
        isDocked && 'opacity-80',
        isHovering && !isNearEdge && 'cursor-pointer',
        isNearEdge && 'cursor-nwse-resize',
        isDraggingEdge && 'cursor-grabbing',
        className
      )}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        perspective: '1000px',
        transform: `scale(${cubeScale})`,
      }}
      onMouseMove={handleMouseMoveGlobal}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <div
        ref={cubeRef}
        className={clsx(
          'relative w-full h-full transition-transform duration-500',
          glowClass,
          cube.mode === 'rotating' && 'animate-spin-slow',
          isExpanded && 'shadow-2xl',
          isCombined && 'shadow-xl shadow-purple-500/60'
        )}
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateX(${cube.rotation.x}deg) rotateY(${cube.rotation.y}deg) rotateZ(${cube.rotation.z}deg)`,
        }}
      >
        {/* Front face */}
        {renderFace('front', faceContent.front, `translateZ(${halfSize}px)`)}

        {/* Back face */}
        {renderFace('back', faceContent.back, `rotateY(180deg) translateZ(${halfSize}px)`)}

        {/* Right face */}
        {renderFace('right', faceContent.right, `rotateY(90deg) translateZ(${halfSize}px)`)}

        {/* Left face */}
        {renderFace('left', faceContent.left, `rotateY(-90deg) translateZ(${halfSize}px)`)}

        {/* Top face */}
        {renderFace('top', faceContent.top, `rotateX(90deg) translateZ(${halfSize}px)`)}

        {/* Bottom face */}
        {renderFace('bottom', faceContent.bottom, `rotateX(-90deg) translateZ(${halfSize}px)`)}

        {/* Glow effect */}
        {isExpanded && (
          <div
            className={clsx(
              'absolute inset-0 rounded-lg blur-xl opacity-50',
              'pointer-events-none',
              colorClass.split(' ')[0] // Just the background gradient
            )}
            style={{
              transform: `translateZ(${halfSize}px)`,
            }}
          />
        )}
      </div>

      {/* Docked indicator */}
      {isDocked && (
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-white/60 whitespace-nowrap">
          📌 Docked
        </div>
      )}

      {/* Combined indicator */}
      {isCombined && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-purple-300 whitespace-nowrap">
          🔗 Combined
        </div>
      )}

      {/* Expansion overlay */}
      {showExpansion && containerRef.current && (
        <CubeExpansionOverlay
          cube={cube}
          cubeElement={containerRef.current}
          onClose={() => setShowExpansion(false)}
        />
      )}

      {/* Edge drag indicator */}
      {isNearEdge && !isDraggingEdge && (
        <div className="absolute inset-0 rounded-lg border-2 border-cyan-400/50 pointer-events-none animate-pulse" />
      )}

      {/* Drag feedback */}
      {isDraggingEdge && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-xs text-cyan-300 whitespace-nowrap bg-black/80 px-3 py-1.5 rounded backdrop-blur-sm pointer-events-none">
          ↗️ Drag to expand
        </div>
      )}
    </div>
  );
}

// Preset cube configurations
export const CUBE_CONFIGS = {
  control: {
    front: <div className="text-blue-300">⚡</div>,
    back: <div className="text-purple-300">🎮</div>,
    left: <div className="text-indigo-300">🎨</div>,
    right: <div className="text-cyan-300">📊</div>,
    top: <div className="text-violet-300">⚙️</div>,
    bottom: <div className="text-blue-400">🔍</div>,
  },
  provider: {
    front: <div className="text-green-300">🌐</div>,
    back: <div className="text-teal-300">📡</div>,
    left: <div className="text-emerald-300">🔌</div>,
    right: <div className="text-lime-300">⚙️</div>,
    top: <div className="text-green-400">✨</div>,
    bottom: <div className="text-teal-400">📊</div>,
  },
  preset: {
    front: <div className="text-orange-300">🎭</div>,
    back: <div className="text-red-300">📋</div>,
    left: <div className="text-amber-300">💾</div>,
    right: <div className="text-yellow-300">⭐</div>,
    top: <div className="text-orange-400">🎨</div>,
    bottom: <div className="text-red-400">📂</div>,
  },
  panel: {
    front: <div className="text-cyan-300">🪟</div>,
    back: <div className="text-indigo-300">📐</div>,
    left: <div className="text-sky-300">🔲</div>,
    right: <div className="text-blue-300">📊</div>,
    top: <div className="text-cyan-400">✨</div>,
    bottom: <div className="text-indigo-400">⚡</div>,
  },
  settings: {
    front: <div className="text-gray-300">⚙️</div>,
    back: <div className="text-slate-300">🔧</div>,
    left: <div className="text-zinc-300">🎛️</div>,
    right: <div className="text-neutral-300">📝</div>,
    top: <div className="text-gray-400">🔑</div>,
    bottom: <div className="text-slate-400">💡</div>,
  },
} satisfies Record<CubeType, CubeFaceContent>;

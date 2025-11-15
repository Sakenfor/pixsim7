import { ReactNode, useEffect, useRef, useState } from 'react';
import { useControlCubeStore, type CubeType, type CubeFace } from '../../stores/controlCubeStore';
import { cubeExpansionRegistry } from '../../lib/cubeExpansionRegistry';
import { CubeExpansionOverlay } from './CubeExpansionOverlay';
import { CubeTooltip, useTooltipDismissal } from '../ui/CubeTooltip';
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

// Helper function to get the actual face based on visual direction and current active face
const getRotatedFace = (visualDirection: 'left' | 'right' | 'top' | 'bottom', activeFace: CubeFace): CubeFace => {
  // Map of active face to what's visible at each edge
  const faceMap: Record<CubeFace, Record<'left' | 'right' | 'top' | 'bottom', CubeFace>> = {
    front: { left: 'left', right: 'right', top: 'top', bottom: 'bottom' },
    back: { left: 'right', right: 'left', top: 'top', bottom: 'bottom' },
    left: { left: 'back', right: 'front', top: 'top', bottom: 'bottom' },
    right: { left: 'front', right: 'back', top: 'top', bottom: 'bottom' },
    top: { left: 'left', right: 'right', top: 'back', bottom: 'front' },
    bottom: { left: 'left', right: 'right', top: 'front', bottom: 'back' },
  };

  return faceMap[activeFace][visualDirection];
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
  const [hoverAtEdge, setHoverAtEdge] = useState(false);
  const lastClickTime = useRef<number>(0);

  // Tooltip dismissal state
  const edgeHoverTooltip = useTooltipDismissal(`edge-hover-${cubeId}`);
  const doubleClickTooltip = useTooltipDismissal(`double-click-${cubeId}`);
  const linkingTooltip = useTooltipDismissal(`linking-${cubeId}`);
  const dockedTooltip = useTooltipDismissal(`docked-${cubeId}`);
  const combinedTooltip = useTooltipDismissal(`combined-${cubeId}`);

  // Store state for context-aware tooltips
  const linkingMode = useControlCubeStore((s) => s.linkingMode);
  const linkingFromCube = useControlCubeStore((s) => s.linkingFromCube);
  const combinedCubeIds = useControlCubeStore((s) => s.combinedCubeIds);

  // Handle mouse move for hover tilt effect
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !cube) return;

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Calculate mouse position relative to cube center (-1 to 1)
    const x = (e.clientX - centerX) / (rect.width / 2);
    const y = (e.clientY - centerY) / (rect.height / 2);

    // Determine which face is being hovered and whether we're truly at the edge
    const absX = Math.abs(x);
    const absY = Math.abs(y);

    // Simpler approach: detect which dimension is dominant
    const centerThreshold = 0.4; // Center zone radius
    const edgeThreshold = 0.7;   // Edge starts here

    let face: CubeFace = cube.activeFace;
    let atEdge = false;

    // Check if we're clearly at an edge (dominant dimension)
    if (absX > absY) {
      // Horizontal dimension dominant
      if (absX > edgeThreshold) {
        // At horizontal edge
        atEdge = true;
        const visualDirection = x > 0 ? 'right' : 'left';
        face = getRotatedFace(visualDirection, cube.activeFace);
      } else if (absX < centerThreshold && absY < centerThreshold) {
        // In center
        face = cube.activeFace;
      } else {
        // Between center and edge - still center
        face = cube.activeFace;
      }
    } else {
      // Vertical dimension dominant
      if (absY > edgeThreshold) {
        // At vertical edge
        atEdge = true;
        const visualDirection = y > 0 ? 'bottom' : 'top';
        face = getRotatedFace(visualDirection, cube.activeFace);
      } else if (absX < centerThreshold && absY < centerThreshold) {
        // In center
        face = cube.activeFace;
      } else {
        // Between center and edge - still center
        face = cube.activeFace;
      }
    }

    setHoveredFace(face);
    setHoverAtEdge(atEdge);

    // Apply tilt based on mouse position in SCREEN SPACE (not cube local space)
    // This ensures the tilt works correctly regardless of the cube's current rotation
    const tiltAmount = 20;

    let tiltX = 0;
    let tiltY = 0;

    if (atEdge) {
      // Apply tilt based on screen position, not face name
      // This makes the cube tilt toward the edge you're hovering over
      if (absX > absY) {
        // Horizontal edge - tilt left/right based on mouse X position
        // Negative because CSS rotateY is counter-clockwise for positive values
        tiltY = -x * tiltAmount;
      } else {
        // Vertical edge - tilt up/down based on mouse Y position
        tiltX = y * tiltAmount;
      }
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

  // Expand cube into a floating panel
  const expandToPanel = () => {
    if (!containerRef.current || !cube) return;

    const rect = containerRef.current.getBoundingClientRect();

    // Get cube's current screen position
    const expandPosition = {
      x: cube.position.x,
      y: cube.position.y
    };

    // Notify parent to create panel
    onExpand?.(cubeId, expandPosition);
  };

  // Handle double-click to expand
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    expandToPanel();
  };

  // Click to rotate to the revealed (hovered) face
  const handleCubeClick = (e: React.MouseEvent) => {
    if (!hoveredFace || !cube) return;

    const now = Date.now();
    const timeSinceLastClick = now - lastClickTime.current;

    // Check for double-click (within 300ms)
    if (timeSinceLastClick < 300) {
      // Double-click handled by handleDoubleClick
      return;
    }

    lastClickTime.current = now;
    e.stopPropagation();

    // If clicking the currently active face (the one showing), open the action
    if (hoveredFace === cube.activeFace) {
      onFaceClick?.(hoveredFace);
      return;
    }

    // Only rotate when the hover is truly in the edge band
    if (!hoverAtEdge) {
      // Treat non-edge clicks as center clicks: no rotation, optional action
      onFaceClick?.(cube.activeFace);
      return;
    }

    // For non-active faces at the edge, rotate to show that face (no action here)
    rotateCubeFace(cubeId, hoveredFace);
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

  // Auto-dismiss edge hover tooltip after user has used it a few times
  useEffect(() => {
    if (hoverAtEdge && !edgeHoverTooltip.dismissed) {
      const count = parseInt(localStorage.getItem(`edge-hover-count-${cubeId}`) || '0');
      if (count >= 3) {
        edgeHoverTooltip.dismiss();
      } else {
        localStorage.setItem(`edge-hover-count-${cubeId}`, String(count + 1));
      }
    }
  }, [hoverAtEdge, cubeId, edgeHoverTooltip]);

  // Determine which tooltip to show based on context
  const getTooltipContent = () => {
    if (!cube) return null;

    // Priority 1: Linking mode (most important)
    if (linkingMode) {
      if (linkingFromCube?.cubeId === cubeId) {
        return {
          id: 'linking-source',
          content: 'Click another cube face to connect',
          variant: 'info' as const,
          show: !linkingTooltip.dismissed && isHovering,
          shortcut: 'ESC to cancel',
        };
      } else {
        return {
          id: 'linking-target',
          content: 'Click to create connection',
          variant: 'info' as const,
          show: !linkingTooltip.dismissed && isHovering,
        };
      }
    }

    // Priority 2: Docked state
    if (cube.mode === 'docked') {
      return {
        id: 'docked',
        content: 'Docked to panel • Double-click to expand',
        variant: 'success' as const,
        show: !dockedTooltip.dismissed && isHovering,
        shortcut: 'E',
      };
    }

    // Priority 3: Combined state
    if (cube.mode === 'combined' || combinedCubeIds.includes(cubeId)) {
      return {
        id: 'combined',
        content: 'Combined with other cubes • Drag apart to separate',
        variant: 'warning' as const,
        show: !combinedTooltip.dismissed && isHovering,
      };
    }

    // Priority 4: Edge hover hint (for new users)
    if (hoverAtEdge && !edgeHoverTooltip.dismissed) {
      return {
        id: 'edge-hover',
        content: 'Click edge to rotate • Click center for action',
        variant: 'default' as const,
        show: true,
      };
    }

    // Priority 5: Double-click hint (shown on hover if not dismissed)
    if (isHovering && !doubleClickTooltip.dismissed && !hoverAtEdge) {
      return {
        id: 'double-click',
        content: 'Double-click to expand',
        variant: 'default' as const,
        show: true,
        shortcut: 'E',
        delay: 1000, // Show after 1s hover
      };
    }

    // Priority 6: Gallery-specific tooltips
    if (cube.type === 'gallery' && isHovering) {
      if (cube.pinnedAssets && Object.keys(cube.pinnedAssets).length > 0) {
        return {
          id: 'gallery-pinned',
          content: 'Pinned assets on faces • Rotate to view',
          variant: 'info' as const,
          show: true,
          delay: 800,
        };
      }
    }

    return null;
  };

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
          'rounded-xl',  // Soften edges with border-radius
          colorClass,
          isActive && 'border-white/70 shadow-lg',
          !isActive && 'hover:border-white/50',
          'select-none'
        )}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          transform,
        }}
      >
        <div>
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
        isHovering && 'cursor-pointer',
        className
      )}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        perspective: '1000px',
        transform: `scale(${cubeScale})`,
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleCubeClick}
      onDoubleClick={handleDoubleClick}
    >
      <div
        ref={cubeRef}
        className={clsx(
          'relative w-full h-full transition-transform duration-150',
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

      {/* Context-aware tooltip */}
      {(() => {
        const tooltipData = getTooltipContent();
        if (!tooltipData) return null;

        return (
          <CubeTooltip
            content={tooltipData.content}
            variant={tooltipData.variant}
            show={tooltipData.show}
            shortcut={tooltipData.shortcut}
            delay={tooltipData.delay ?? 500}
            position="top"
          />
        );
      })()}
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

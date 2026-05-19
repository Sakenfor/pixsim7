/**
 * DraggableCube Component
 *
 * A 3D CSS cube that can be dragged around the screen.
 * Uses CSS transforms for 3D effect and pointer events for drag behavior.
 */

import {
  DEFAULT_CUBE_SIZE,
  CUBE_HOVER_TILT,
  DRAG_THRESHOLD,
} from '@pixsim7/pixcubes';
import { Z } from '@pixsim7/shared.ui';
import { clsx } from 'clsx';
import { useRef, useState, useCallback, useEffect } from 'react';

import { useCubeStore, type CubeFace, type CubeFaceContentMap } from '../useCubeStore';


export interface DraggableCubeProps {
  cubeId: string;
  size?: number;
  faceContent?: CubeFaceContentMap;
  className?: string;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onFaceClick?: (face: CubeFace) => void;
  onExpand?: (cubeId: string, position: { x: number; y: number }) => void;
}

const FACES: CubeFace[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

export function DraggableCube({
  cubeId,
  size = DEFAULT_CUBE_SIZE,
  faceContent,
  className,
  onDragStart,
  onDragEnd,
  onFaceClick,
}: DraggableCubeProps) {
  const cube = useCubeStore((s) => s.cubes[cubeId]);
  const updateCube = useCubeStore((s) => s.updateCube);
  const removeCube = useCubeStore((s) => s.removeCube);

  const cubeRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  // Handle pointer down - start potential drag (pointer, not mouse, so touch works)
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return; // primary button / primary touch only
      e.preventDefault();
      e.stopPropagation();

      const rect = cubeRef.current?.getBoundingClientRect();
      if (!rect) return;

      try {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* pointer may already be gone */
      }

      setIsDragging(true);
      hasMoved.current = false;
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      setDragOffset({
        x: e.clientX - (cube?.position.x ?? 0),
        y: e.clientY - (cube?.position.y ?? 0),
      });

      onDragStart?.();
    },
    [cube?.position, onDragStart]
  );

  // Handle mouse move - drag the cube
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;

      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        hasMoved.current = true;
      }

      updateCube(cubeId, {
        position: {
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        },
      });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      onDragEnd?.();

      // If we didn't move much, treat as click
      if (!hasMoved.current && onFaceClick) {
        // Determine which face was clicked based on rotation
        const face = determineFaceFromRotation(rotation);
        onFaceClick(face);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging, cubeId, dragOffset, rotation, updateCube, onDragEnd, onFaceClick]);

  // Handle hover rotation
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) return;

      const rect = cubeRef.current?.getBoundingClientRect();
      if (!rect) return;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const rotateY = ((e.clientX - centerX) / (rect.width / 2)) * CUBE_HOVER_TILT;
      const rotateX = -((e.clientY - centerY) / (rect.height / 2)) * CUBE_HOVER_TILT;

      setRotation({ x: rotateX, y: rotateY });
    },
    [isDragging]
  );

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    if (!isDragging) {
      setRotation({ x: 0, y: 0 });
    }
  }, [isDragging]);

  // Right-click to dismiss
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      removeCube(cubeId);
    },
    [cubeId, removeCube]
  );

  if (!cube || !cube.visible) return null;

  const halfSize = size / 2;

  // Get face transforms for CSS 3D cube
  const faceTransforms: Record<CubeFace, string> = {
    front: `translateZ(${halfSize}px)`,
    back: `translateZ(-${halfSize}px) rotateY(180deg)`,
    left: `translateX(-${halfSize}px) rotateY(-90deg)`,
    right: `translateX(${halfSize}px) rotateY(90deg)`,
    top: `translateY(-${halfSize}px) rotateX(90deg)`,
    bottom: `translateY(${halfSize}px) rotateX(-90deg)`,
  };

  return (
    <div
      ref={cubeRef}
      className={clsx(
        'absolute pointer-events-auto cursor-grab select-none',
        isDragging && 'cursor-grabbing',
        className
      )}
      style={{
        left: cube.position.x,
        top: cube.position.y,
        width: size,
        height: size,
        zIndex: isDragging ? Z.floatOverlay : cube.zIndex,
        perspective: '1000px',
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
    >
      {/* 3D Cube container */}
      <div
        className="w-full h-full relative transition-transform duration-150"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
        }}
      >
        {FACES.map((face) => (
          <div
            key={face}
            className={clsx(
              'absolute inset-0 flex items-center justify-center',
              'bg-gradient-to-br from-neutral-800/90 to-neutral-900/90',
              'border border-white/20 backdrop-blur-sm',
              'transition-all duration-150',
              isHovered && 'border-cyan-400/40'
            )}
            style={{
              transform: faceTransforms[face],
              backfaceVisibility: 'hidden',
            }}
          >
            {faceContent?.[face] ?? (
              <span className="text-white/60 text-xs uppercase">{face}</span>
            )}
          </div>
        ))}
      </div>

      {/* Minimized panel indicator */}
      {cube.minimizedPanel && (
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-cyan-300 whitespace-nowrap bg-black/60 px-2 py-0.5 rounded backdrop-blur-sm">
          {cube.minimizedPanel.panelId}
        </div>
      )}
    </div>
  );
}

/**
 * Determine which face is most visible based on current rotation
 */
function determineFaceFromRotation(rotation: { x: number; y: number }): CubeFace {
  const absX = Math.abs(rotation.x);
  const absY = Math.abs(rotation.y);

  // If rotation is mostly horizontal
  if (absY > absX) {
    if (rotation.y > 2) return 'right';
    if (rotation.y < -2) return 'left';
  }

  // If rotation is mostly vertical
  if (absX > absY) {
    if (rotation.x > 2) return 'bottom';
    if (rotation.x < -2) return 'top';
  }

  return 'front';
}

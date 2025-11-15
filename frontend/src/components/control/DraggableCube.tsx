import { useRef } from 'react';
import Draggable from 'react-draggable';
import type { DraggableData, DraggableEvent } from 'react-draggable';
import { ControlCube, type CubeFaceContent } from './ControlCube';
import type { CubeFace } from '../../stores/controlCubeStore';
import { useControlCubeStore } from '../../stores/controlCubeStore';
import { clsx } from 'clsx';
import { BASE_CUBE_SIZE } from '../../config/cubeConstants';

export interface DraggableCubeProps {
  cubeId: string;
  size?: number;
  faceContent?: CubeFaceContent;
  onDragStart?: () => void;
  onDragStop?: () => void;
  onFaceClick?: (face: CubeFace) => void;
  onExpand?: (cubeId: string, position: { x: number; y: number }) => void;
}

export function DraggableCube({
  cubeId,
  size = BASE_CUBE_SIZE,
  faceContent,
  onDragStart,
  onDragStop,
  onFaceClick,
  onExpand,
}: DraggableCubeProps) {
  const nodeRef = useRef<HTMLDivElement>(null);

  const cube = useControlCubeStore((s) => s.cubes[cubeId]);
  const setCubePosition = useControlCubeStore((s) => s.setCubePosition);
  const setActiveCube = useControlCubeStore((s) => s.setActiveCube);
  const updateCube = useControlCubeStore((s) => s.updateCube);

  // Position syncing is handled by react-draggable via controlled position prop
  // Removed manual DOM manipulation to prevent race conditions with multiple position sources

  if (!cube || !cube.visible) return null;

  const handleDragStart = (_e: DraggableEvent, _data: DraggableData) => {
    setActiveCube(cubeId);
    onDragStart?.();
  };

  const handleDrag = (_e: DraggableEvent, data: DraggableData) => {
    setCubePosition(cubeId, { x: data.x, y: data.y });
  };

  const handleDragStop = (_e: DraggableEvent, _data: DraggableData) => {
    onDragStop?.();
  };

  return (
    <Draggable
      nodeRef={nodeRef}
      position={cube.position}
      onStart={handleDragStart}
      onDrag={handleDrag}
      onStop={handleDragStop}
      disabled={cube.mode === 'docked'}
    >
      <div
        ref={nodeRef}
        className={clsx(
          'absolute cursor-grab active:cursor-grabbing',
          'transition-opacity duration-300',
          cube.mode === 'docked' && 'cursor-default'
        )}
        style={{
          zIndex: cube.zIndex,
          pointerEvents: cube.visible ? 'auto' : 'none',
        }}
      >
        <ControlCube
          cubeId={cubeId}
          size={size}
          faceContent={faceContent}
          onFaceClick={onFaceClick}
          onExpand={onExpand}
        />
      </div>
    </Draggable>
  );
}

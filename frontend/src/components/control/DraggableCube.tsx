import { useRef, useEffect } from 'react';
import Draggable, { DraggableData, DraggableEvent } from 'react-draggable';
import { ControlCube, CubeFaceContent } from './ControlCube';
import { useControlCubeStore, CubeFace } from '../../stores/controlCubeStore';
import { clsx } from 'clsx';

export interface DraggableCubeProps {
  cubeId: string;
  size?: number;
  faceContent?: CubeFaceContent;
  onDragStart?: () => void;
  onDragStop?: () => void;
  onFaceClick?: (face: CubeFace) => void;
}

export function DraggableCube({
  cubeId,
  size = 100,
  faceContent,
  onDragStart,
  onDragStop,
  onFaceClick,
}: DraggableCubeProps) {
  const nodeRef = useRef<HTMLDivElement>(null);

  const cube = useControlCubeStore((s) => s.cubes[cubeId]);
  const setCubePosition = useControlCubeStore((s) => s.setCubePosition);
  const setActiveCube = useControlCubeStore((s) => s.setActiveCube);
  const updateCube = useControlCubeStore((s) => s.updateCube);

  // Sync position if changed externally
  useEffect(() => {
    if (!cube || !nodeRef.current) return;
    const el = nodeRef.current;
    el.style.transform = `translate(${cube.position.x}px, ${cube.position.y}px)`;
  }, [cube?.position]);

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
        />
      </div>
    </Draggable>
  );
}

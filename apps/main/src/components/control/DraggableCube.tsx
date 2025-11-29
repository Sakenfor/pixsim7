// Wrapper around pixcubes DraggableCube with pixsim7-specific dependencies
import {
  DraggableCube as PixcubesDraggableCube,
  type DraggableCubeProps as PixcubesDraggableCubeProps,
  type CubeFaceContent,
} from '@pixsim7/scene.cubes';
import { useControlCubeStore, type CubeFace } from '@/stores/controlCubeStore';
import { useCubeSettingsStore } from '@/stores/cubeSettingsStore';
import { cubeExpansionRegistry } from '@/lib/cubeExpansionRegistry';
import { CubeExpansionOverlay } from './CubeExpansionOverlay';
import { CubeTooltip, useTooltipDismissal } from '@pixsim7/shared.ui';
import { Icon } from '@/lib/icons';
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
  const linkingGesture = useCubeSettingsStore((s) => s.linkingGesture);

  return (
    <PixcubesDraggableCube
      cubeId={cubeId}
      useStore={useControlCubeStore}
      size={size}
      faceContent={faceContent}
      onDragStart={onDragStart}
      onDragStop={onDragStop}
      onFaceClick={onFaceClick}
      onExpand={onExpand}
      Icon={Icon}
      CubeTooltip={CubeTooltip}
      CubeExpansionOverlay={CubeExpansionOverlay}
      useTooltipDismissal={useTooltipDismissal}
      cubeExpansionRegistry={cubeExpansionRegistry}
      linkingGesture={linkingGesture}
    />
  );
}

// Wrapper around pixcubes ControlCube with pixsim7-specific UI dependencies
import {
  ControlCube as PixcubesControlCube,
  type ControlCubeProps as PixcubesControlCubeProps,
  type CubeFaceContent,
} from '@pixsim7/scene.cubes';
import { useControlCubeStore, type CubeFace } from '@/stores/controlCubeStore';
import { useCubeSettingsStore } from '@/stores/cubeSettingsStore';
import { cubeExpansionRegistry } from '@/lib/cubeExpansionRegistry';
import { CubeExpansionOverlay } from './CubeExpansionOverlay';
import { CubeTooltip, useTooltipDismissal } from '@pixsim7/shared.ui';
import { Icon } from '@/lib/icons';
import type { ReactNode } from 'react';

export type { CubeFaceContent };

export interface ControlCubeProps {
  cubeId: string;
  size?: number;
  faceContent?: CubeFaceContent;
  className?: string;
  onFaceClick?: (face: CubeFace) => void;
  onExpand?: (cubeId: string, position: { x: number; y: number }) => void;
}

// Default face content
const DEFAULT_FACE_CONTENT: CubeFaceContent = {
  front: <Icon name="zap" size={20} />,
  back: <Icon name="wrench" size={20} />,
  left: <Icon name="palette" size={20} />,
  right: <Icon name="barChart" size={20} />,
  top: <Icon name="settings" size={20} />,
  bottom: <Icon name="search" size={20} />,
};

export function ControlCube({
  cubeId,
  size = 100,
  faceContent = DEFAULT_FACE_CONTENT,
  className,
  onFaceClick,
  onExpand,
}: ControlCubeProps) {
  const linkingGesture = useCubeSettingsStore((s) => s.linkingGesture);

  return (
    <PixcubesControlCube
      cubeId={cubeId}
      useStore={useControlCubeStore}
      size={size}
      faceContent={faceContent}
      className={className}
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

// Re-export preset cube configs from original implementation
export const CUBE_CONFIGS = {
  control: {
    front: <div className="text-blue-300"><Icon name="zap" size={20} /></div>,
    back: <div className="text-purple-300"><Icon name="gamepad" size={20} /></div>,
    left: <div className="text-indigo-300"><Icon name="palette" size={20} /></div>,
    right: <div className="text-cyan-300"><Icon name="barChart" size={20} /></div>,
    top: <div className="text-violet-300"><Icon name="settings" size={20} /></div>,
    bottom: <div className="text-blue-400"><Icon name="search" size={20} /></div>,
  },
  provider: {
    front: <div className="text-green-300"><Icon name="globe" size={20} /></div>,
    back: <div className="text-teal-300"><Icon name="radio" size={20} /></div>,
    left: <div className="text-emerald-300"><Icon name="plug" size={20} /></div>,
    right: <div className="text-lime-300"><Icon name="settings" size={20} /></div>,
    top: <div className="text-green-400"><Icon name="sparkles" size={20} /></div>,
    bottom: <div className="text-teal-400"><Icon name="barChart" size={20} /></div>,
  },
  preset: {
    front: <div className="text-orange-300"><Icon name="drama" size={20} /></div>,
    back: <div className="text-red-300"><Icon name="clipboardList" size={20} /></div>,
    left: <div className="text-amber-300"><Icon name="save" size={20} /></div>,
    right: <div className="text-yellow-300"><Icon name="star" size={20} /></div>,
    top: <div className="text-orange-400"><Icon name="palette" size={20} /></div>,
    bottom: <div className="text-red-400"><Icon name="folder" size={20} /></div>,
  },
  panel: {
    front: <div className="text-cyan-300"><Icon name="layoutGrid" size={20} /></div>,
    back: <div className="text-indigo-300"><Icon name="sliders" size={20} /></div>,
    left: <div className="text-sky-300"><Icon name="layoutGrid" size={20} /></div>,
    right: <div className="text-blue-300"><Icon name="barChart" size={20} /></div>,
    top: <div className="text-cyan-400"><Icon name="sparkles" size={20} /></div>,
    bottom: <div className="text-indigo-400"><Icon name="zap" size={20} /></div>,
  },
  settings: {
    front: <div className="text-gray-300"><Icon name="settings" size={20} /></div>,
    back: <div className="text-slate-300"><Icon name="wrench" size={20} /></div>,
    left: <div className="text-zinc-300"><Icon name="sliders" size={20} /></div>,
    right: <div className="text-neutral-300"><Icon name="fileText" size={20} /></div>,
    top: <div className="text-gray-400"><Icon name="key" size={20} /></div>,
    bottom: <div className="text-slate-400"><Icon name="lightbulb" size={20} /></div>,
  },
} satisfies Record<string, CubeFaceContent>;

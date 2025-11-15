import { ReactNode, useEffect, useRef } from 'react';
import { useControlCubeStore, type CubeType, type CubeFace } from '../../stores/controlCubeStore';
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
}

const CUBE_TYPE_COLORS: Record<CubeType, string> = {
  control: 'bg-gradient-to-br from-blue-500/20 to-purple-500/20 border-blue-400/50',
  provider: 'bg-gradient-to-br from-green-500/20 to-teal-500/20 border-green-400/50',
  preset: 'bg-gradient-to-br from-orange-500/20 to-red-500/20 border-orange-400/50',
  panel: 'bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 border-cyan-400/50',
  settings: 'bg-gradient-to-br from-gray-500/20 to-slate-500/20 border-gray-400/50',
  viewer: 'bg-gradient-to-br from-pink-500/20 to-violet-500/20 border-pink-400/50',
};

const CUBE_TYPE_GLOW: Record<CubeType, string> = {
  control: 'shadow-blue-500/50',
  provider: 'shadow-green-500/50',
  preset: 'shadow-orange-500/50',
  panel: 'shadow-cyan-500/50',
  settings: 'shadow-gray-500/50',
  viewer: 'shadow-pink-500/50',
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
}: ControlCubeProps) {
  const cubeRef = useRef<HTMLDivElement>(null);
  const cube = useControlCubeStore((s) => s.cubes[cubeId]);
  const updateCube = useControlCubeStore((s) => s.updateCube);

  useEffect(() => {
    if (!cube) return;

    // Animate rotation changes
    const cubeEl = cubeRef.current;
    if (cubeEl) {
      cubeEl.style.transform = `
        rotateX(${cube.rotation.x}deg)
        rotateY(${cube.rotation.y}deg)
        rotateZ(${cube.rotation.z}deg)
      `;
    }
  }, [cube?.rotation]);

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
          'cursor-pointer select-none'
        )}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          transform,
        }}
        onClick={() => {
          onFaceClick?.(face);
          updateCube(cubeId, { activeFace: face });
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
      className={clsx(
        'relative transition-all duration-300',
        isDocked && 'opacity-80',
        className
      )}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        perspective: '1000px',
        transform: `scale(${cubeScale})`,
      }}
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

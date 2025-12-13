import { useState, useEffect, useCallback } from 'react';
import { useControlCubeStore, type CubeFace } from '@features/controlCenter/stores/controlCubeStore';
import { ControlCube } from '@features/controlCenter';
import type { LocalAsset } from '../stores/localFoldersStore';
import { clsx } from 'clsx';

export interface MediaViewerCubeProps {
  asset: LocalAsset;
  assetUrl?: string; // Object URL for the media
  allAssets?: LocalAsset[]; // For navigation
  onClose?: () => void;
  onNavigate?: (direction: 'prev' | 'next') => void;
}

type ViewerMode = 'compact' | 'expanded' | 'fullscreen';

export function MediaViewerCube({
  asset,
  assetUrl,
  allAssets = [],
  onClose,
  onNavigate,
}: MediaViewerCubeProps) {
  const [viewerMode, setViewerMode] = useState<ViewerMode>('compact');
  const [cubeId, setCubeId] = useState<string | null>(null);
  const [showMetadata, setShowMetadata] = useState(false);

  const addCube = useControlCubeStore((s) => s.addCube);
  const removeCube = useControlCubeStore((s) => s.removeCube);
  const updateCube = useControlCubeStore((s) => s.updateCube);
  const setCubeMode = useControlCubeStore((s) => s.setCubeMode);
  const cube = useControlCubeStore(
    useCallback(
      (s) => (cubeId ? s.cubes[cubeId] : undefined),
      [cubeId]
    )
  );

  // Create cube on mount
  useEffect(() => {
    const id = addCube('gallery', {
      x: window.innerWidth / 2 - 75,
      y: window.innerHeight / 2 - 75,
    });
    setCubeId(id);

    return () => {
      removeCube(id);
    };
  }, [addCube, removeCube]);

  // Update cube based on viewer mode
  useEffect(() => {
    if (!cubeId || !cube) return;

    switch (viewerMode) {
      case 'compact':
        updateCube(cubeId, { scale: 1.5, mode: 'idle' });
        break;
      case 'expanded':
        updateCube(cubeId, { scale: 2, mode: 'expanded' });
        break;
      case 'fullscreen':
        updateCube(cubeId, { scale: 1, mode: 'expanded' });
        break;
    }
  }, [viewerMode, cube, cubeId, updateCube]);

  const currentIndex = allAssets.findIndex((a) => a.key === asset.key);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allAssets.length - 1;

  const handleNavigate = useCallback(
    (direction: 'prev' | 'next') => {
      onNavigate?.(direction);
    },
    [onNavigate]
  );

  const handleClose = useCallback(() => {
    if (cubeId) {
      removeCube(cubeId);
    }
    onClose?.();
  }, [cubeId, removeCube, onClose]);

  const handleFaceClick = (face: CubeFace) => {
    switch (face) {
      case 'front':
        // Toggle between compact and expanded
        setViewerMode((m) => (m === 'compact' ? 'expanded' : 'compact'));
        break;
      case 'back':
        // Toggle metadata
        setShowMetadata((m) => !m);
        break;
      case 'left':
        // Previous asset
        if (hasPrev) handleNavigate('prev');
        break;
      case 'right':
        // Next asset
        if (hasNext) handleNavigate('next');
        break;
      case 'top':
        // Fullscreen toggle
        setViewerMode((m) => (m === 'fullscreen' ? 'expanded' : 'fullscreen'));
        break;
      case 'bottom':
        // Close viewer
        handleClose();
        break;
    }
  };

  const cubeFaceContent = {
    front: (
      <div className="flex flex-col items-center text-pink-300">
        {assetUrl ? (
          asset.kind === 'image' ? (
            <img
              src={assetUrl}
              alt={asset.name}
              className="w-full h-full object-cover rounded"
            />
          ) : (
            <video
              src={assetUrl}
              className="w-full h-full object-cover rounded"
              autoPlay
              loop
              muted
            />
          )
        ) : (
          <div className="text-4xl">{asset.kind === 'image' ? '🖼️' : '🎬'}</div>
        )}
      </div>
    ),
    back: (
      <div className="text-violet-300 text-sm flex flex-col items-center">
        <div className="text-2xl">📋</div>
        <div className="text-xs">Info</div>
      </div>
    ),
    left: (
      <div
        className={clsx(
          'text-sm flex flex-col items-center',
          hasPrev ? 'text-purple-300' : 'text-gray-500'
        )}
      >
        <div className="text-2xl">◀</div>
        <div className="text-xs">Prev</div>
      </div>
    ),
    right: (
      <div
        className={clsx(
          'text-sm flex flex-col items-center',
          hasNext ? 'text-pink-300' : 'text-gray-500'
        )}
      >
        <div className="text-2xl">▶</div>
        <div className="text-xs">Next</div>
      </div>
    ),
    top: (
      <div className="text-fuchsia-300 text-sm flex flex-col items-center">
        <div className="text-2xl">{viewerMode === 'fullscreen' ? '⊡' : '⊞'}</div>
        <div className="text-xs">{viewerMode === 'fullscreen' ? 'Exit' : 'Full'}</div>
      </div>
    ),
    bottom: (
      <div className="text-red-300 text-sm flex flex-col items-center">
        <div className="text-2xl">✕</div>
        <div className="text-xs">Close</div>
      </div>
    ),
  };

  return (
    <>
      {/* The 3D Cube */}
      {cube && (
        <div
          className="fixed z-50"
          style={{
            left: `${cube.position.x}px`,
            top: `${cube.position.y}px`,
          }}
        >
          <ControlCube
            cubeId={cubeId}
            size={150}
            faceContent={cubeFaceContent}
            onFaceClick={handleFaceClick}
          />
        </div>
      )}

      {/* Expanded Viewer Overlay */}
      {viewerMode === 'expanded' && assetUrl && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-8">
          <div className="max-w-6xl max-h-[90vh] w-full relative">
            {/* Media */}
            <div className="bg-black rounded-lg overflow-hidden shadow-2xl">
              {asset.kind === 'image' ? (
                <img
                  src={assetUrl}
                  alt={asset.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <video
                  src={assetUrl}
                  className="w-full h-full object-contain"
                  controls
                  autoPlay
                />
              )}
            </div>

            {/* Media Info */}
            <div className="mt-4 text-white">
              <h2 className="text-2xl font-bold mb-2">{asset.name}</h2>
              <div className="flex gap-4 text-sm text-neutral-300">
                <span className="capitalize">{asset.kind}</span>
                {asset.size && <span>{(asset.size / 1024 / 1024).toFixed(1)} MB</span>}
                {currentIndex >= 0 && (
                  <span>
                    {currentIndex + 1} / {allAssets.length}
                  </span>
                )}
              </div>
            </div>

            {/* Navigation Arrows */}
            <div className="absolute top-1/2 -translate-y-1/2 left-4">
              {hasPrev && (
                <button
                  onClick={() => handleNavigate('prev')}
                  className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-2xl transition-all"
                >
                  ◀
                </button>
              )}
            </div>
            <div className="absolute top-1/2 -translate-y-1/2 right-4">
              {hasNext && (
                <button
                  onClick={() => handleNavigate('next')}
                  className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-2xl transition-all"
                >
                  ▶
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Viewer */}
      {viewerMode === 'fullscreen' && assetUrl && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
          {asset.kind === 'image' ? (
            <img
              src={assetUrl}
              alt={asset.name}
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <video
              src={assetUrl}
              className="max-w-full max-h-full object-contain"
              controls
              autoPlay
            />
          )}

          {/* Fullscreen controls */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4">
            {hasPrev && (
              <button
                onClick={() => handleNavigate('prev')}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white transition-all"
              >
                ◀ Previous
              </button>
            )}
            <button
              onClick={() => setViewerMode('expanded')}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white transition-all"
            >
              Exit Fullscreen
            </button>
            {hasNext && (
              <button
                onClick={() => handleNavigate('next')}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white transition-all"
              >
                Next ▶
              </button>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-2xl transition-all"
          >
            ✕
          </button>
        </div>
      )}

      {/* Metadata Panel */}
      {showMetadata && (
        <div className="fixed right-4 top-1/2 -translate-y-1/2 z-50 w-80 bg-black/90 backdrop-blur-lg rounded-lg p-6 text-white shadow-2xl border border-white/20">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <span>📋</span>
            Metadata
          </h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-neutral-400">Name:</span>
              <div className="font-medium break-words">{asset.name}</div>
            </div>
            <div>
              <span className="text-neutral-400">Path:</span>
              <div className="font-mono text-xs break-words text-neutral-300">
                {asset.relativePath}
              </div>
            </div>
            <div>
              <span className="text-neutral-400">Type:</span>
              <div className="font-medium capitalize">{asset.kind}</div>
            </div>
            {asset.size && (
              <div>
                <span className="text-neutral-400">Size:</span>
                <div className="font-medium">{(asset.size / 1024 / 1024).toFixed(2)} MB</div>
              </div>
            )}
            {asset.lastModified && (
              <div>
                <span className="text-neutral-400">Modified:</span>
                <div className="font-medium">
                  {new Date(asset.lastModified).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowMetadata(false)}
            className="mt-4 w-full px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all"
          >
            Close
          </button>
        </div>
      )}
    </>
  );
}

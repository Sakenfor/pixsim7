/**
 * Asset Viewer Panel
 *
 * Side panel for viewing assets with controls and metadata.
 * Used in the side-push layout for both gallery and local folders.
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  useAssetViewerStore,
  selectCanNavigatePrev,
  selectCanNavigateNext,
} from '@/stores/assetViewerStore';
import { Icon } from '@/lib/icons';
import { Button } from '@pixsim7/shared.ui';

export function AssetViewerPanel() {
  const currentAsset = useAssetViewerStore((s) => s.currentAsset);
  const mode = useAssetViewerStore((s) => s.mode);
  const settings = useAssetViewerStore((s) => s.settings);
  const showMetadata = useAssetViewerStore((s) => s.showMetadata);
  const currentIndex = useAssetViewerStore((s) => s.currentIndex);
  const assetListLength = useAssetViewerStore((s) => s.assetList.length);
  const canNavigatePrev = useAssetViewerStore(selectCanNavigatePrev);
  const canNavigateNext = useAssetViewerStore(selectCanNavigateNext);

  const closeViewer = useAssetViewerStore((s) => s.closeViewer);
  const toggleFullscreen = useAssetViewerStore((s) => s.toggleFullscreen);
  const navigatePrev = useAssetViewerStore((s) => s.navigatePrev);
  const navigateNext = useAssetViewerStore((s) => s.navigateNext);
  const toggleMetadata = useAssetViewerStore((s) => s.toggleMetadata);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Keyboard navigation
  useEffect(() => {
    if (mode === 'closed') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'Escape':
          closeViewer();
          break;
        case 'ArrowLeft':
          if (canNavigatePrev) navigatePrev();
          break;
        case 'ArrowRight':
          if (canNavigateNext) navigateNext();
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'i':
        case 'I':
          toggleMetadata();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, canNavigatePrev, canNavigateNext, closeViewer, navigatePrev, navigateNext, toggleFullscreen, toggleMetadata]);

  if (!currentAsset || mode === 'closed') {
    return null;
  }

  const mediaUrl = currentAsset.fullUrl || currentAsset.url;

  const renderMedia = () => {
    if (currentAsset.type === 'video') {
      return (
        <video
          ref={videoRef}
          src={mediaUrl}
          className="max-w-full max-h-full object-contain rounded-lg"
          controls
          autoPlay={settings.autoPlayVideos}
          loop={settings.loopVideos}
        />
      );
    }

    return (
      <img
        src={mediaUrl}
        alt={currentAsset.name}
        className="max-w-full max-h-full object-contain rounded-lg"
      />
    );
  };

  const renderMetadata = () => {
    if (!showMetadata || !currentAsset.metadata) return null;

    const { metadata } = currentAsset;

    return (
      <div className="mt-4 p-4 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-sm space-y-2">
        {metadata.description && (
          <div>
            <span className="text-neutral-500 dark:text-neutral-400">Description:</span>
            <p className="text-neutral-700 dark:text-neutral-300">{metadata.description}</p>
          </div>
        )}
        {metadata.tags && metadata.tags.length > 0 && (
          <div>
            <span className="text-neutral-500 dark:text-neutral-400">Tags:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {metadata.tags.map((tag, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
        {metadata.size && (
          <div className="flex justify-between">
            <span className="text-neutral-500 dark:text-neutral-400">Size:</span>
            <span>{(metadata.size / 1024 / 1024).toFixed(2)} MB</span>
          </div>
        )}
        {metadata.createdAt && (
          <div className="flex justify-between">
            <span className="text-neutral-500 dark:text-neutral-400">Created:</span>
            <span>{new Date(metadata.createdAt).toLocaleDateString()}</span>
          </div>
        )}
        {metadata.path && (
          <div>
            <span className="text-neutral-500 dark:text-neutral-400">Path:</span>
            <p className="text-xs font-mono text-neutral-600 dark:text-neutral-400 break-all">
              {metadata.path}
            </p>
          </div>
        )}
        {metadata.duration && (
          <div className="flex justify-between">
            <span className="text-neutral-500 dark:text-neutral-400">Duration:</span>
            <span>{metadata.duration.toFixed(1)}s</span>
          </div>
        )}
      </div>
    );
  };

  // Side panel mode
  if (mode === 'side') {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-700">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-3 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-2 min-w-0">
            <Icon
              name={currentAsset.type === 'video' ? 'video' : 'image'}
              size={16}
              className="text-neutral-500 flex-shrink-0"
            />
            <span className="text-sm font-medium truncate" title={currentAsset.name}>
              {currentAsset.name}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={toggleMetadata}
              className={`p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors ${
                showMetadata ? 'text-blue-500' : 'text-neutral-500'
              }`}
              title="Toggle metadata (I)"
            >
              <Icon name="info" size={16} />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-neutral-500"
              title="Fullscreen (F)"
            >
              <Icon name="target" size={16} />
            </button>
            <button
              onClick={closeViewer}
              className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-neutral-500"
              title="Close (Esc)"
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>

        {/* Media preview */}
        <div className="flex-1 flex items-center justify-center p-4 min-h-0 bg-neutral-50 dark:bg-neutral-950">
          {renderMedia()}
        </div>

        {/* Navigation + metadata */}
        <div className="flex-shrink-0 p-3 border-t border-neutral-200 dark:border-neutral-700">
          {/* Navigation */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={navigatePrev}
              disabled={!canNavigatePrev}
              className="p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Previous (Left Arrow)"
            >
              <Icon name="chevronLeft" size={20} />
            </button>
            <span className="text-sm text-neutral-500">
              {currentIndex + 1} / {assetListLength}
            </span>
            <button
              onClick={navigateNext}
              disabled={!canNavigateNext}
              className="p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Next (Right Arrow)"
            >
              <Icon name="chevronRight" size={20} />
            </button>
          </div>

          {/* Metadata (collapsible) */}
          {renderMetadata()}
        </div>
      </div>
    );
  }

  // Fullscreen mode
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-10">
        <div className="flex items-center gap-3 text-white">
          <Icon name={currentAsset.type === 'video' ? 'video' : 'image'} size={20} />
          <span className="text-lg font-medium">{currentAsset.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMetadata}
            className={`p-2 rounded-lg hover:bg-white/10 transition-colors ${
              showMetadata ? 'text-blue-400' : 'text-white'
            }`}
            title="Toggle metadata (I)"
          >
            <Icon name="info" size={20} />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white"
            title="Exit fullscreen (F)"
          >
            <Icon name="x" size={20} />
          </button>
        </div>
      </div>

      {/* Media container */}
      <div className="flex-1 flex items-center justify-center p-8">
        {renderMedia()}
      </div>

      {/* Navigation */}
      {canNavigatePrev && (
        <button
          onClick={navigatePrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          title="Previous (Left Arrow)"
        >
          <Icon name="chevronLeft" size={24} />
        </button>
      )}
      {canNavigateNext && (
        <button
          onClick={navigateNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          title="Next (Right Arrow)"
        >
          <Icon name="chevronRight" size={24} />
        </button>
      )}

      {/* Bottom bar */}
      <div className="flex-shrink-0 flex items-center justify-center p-4 bg-gradient-to-t from-black/80 to-transparent absolute bottom-0 left-0 right-0">
        <span className="text-white/70 text-sm">
          {currentIndex + 1} / {assetListLength}
        </span>
      </div>

      {/* Metadata sidebar (fullscreen) */}
      {showMetadata && currentAsset.metadata && (
        <div className="absolute right-4 top-20 bottom-20 w-80 bg-black/90 backdrop-blur-lg rounded-lg p-4 text-white overflow-y-auto">
          <h3 className="text-lg font-semibold mb-4">Metadata</h3>
          <div className="space-y-3 text-sm">
            {currentAsset.metadata.description && (
              <div>
                <span className="text-neutral-400">Description</span>
                <p className="mt-1">{currentAsset.metadata.description}</p>
              </div>
            )}
            {currentAsset.metadata.tags && currentAsset.metadata.tags.length > 0 && (
              <div>
                <span className="text-neutral-400">Tags</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {currentAsset.metadata.tags.map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 bg-white/10 rounded text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {currentAsset.metadata.size && (
              <div className="flex justify-between">
                <span className="text-neutral-400">Size</span>
                <span>{(currentAsset.metadata.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            )}
            {currentAsset.metadata.createdAt && (
              <div className="flex justify-between">
                <span className="text-neutral-400">Created</span>
                <span>{new Date(currentAsset.metadata.createdAt).toLocaleDateString()}</span>
              </div>
            )}
            {currentAsset.metadata.path && (
              <div>
                <span className="text-neutral-400">Path</span>
                <p className="text-xs font-mono mt-1 text-neutral-300 break-all">
                  {currentAsset.metadata.path}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

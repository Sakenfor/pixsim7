/**
 * MediaControlBar
 *
 * Unified control bar for media viewer with navigation, zoom, fit, and maximize controls.
 */

import { Icon } from '@lib/icons';
import type { FitMode } from './MediaDisplay';
import type { AssetViewerOverlayMode } from '@features/mediaViewer';
import type { MediaOverlayId, MediaOverlayTone, MediaOverlayTool } from '../overlays';

interface MediaControlBarProps {
  // Navigation
  currentIndex: number;
  assetListLength: number;
  canNavigatePrev: boolean;
  canNavigateNext: boolean;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;

  // Zoom
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;

  // Fit mode
  fitMode: FitMode;
  onFitModeChange: (mode: FitMode) => void;

  // Maximize
  isMaximized: boolean;
  onToggleMaximize: () => void;

  // Overlay mode
  overlayMode?: AssetViewerOverlayMode;
  overlayTools?: MediaOverlayTool[];
  onToggleOverlay?: (id: MediaOverlayId) => void;
}

export function MediaControlBar({
  currentIndex,
  assetListLength,
  canNavigatePrev,
  canNavigateNext,
  onNavigatePrev,
  onNavigateNext,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  fitMode,
  onFitModeChange,
  isMaximized,
  onToggleMaximize,
  overlayMode,
  overlayTools,
  onToggleOverlay,
}: MediaControlBarProps) {
  const isOverlayActive = overlayMode !== undefined && overlayMode !== 'none';
  const overlayList = overlayTools ?? [];
  const toneClasses: Record<MediaOverlayTone, string> = {
    green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  };

  return (
    <div className="flex-shrink-0 border-t border-neutral-200 dark:border-neutral-700">
      <div className="flex items-center justify-between px-3 py-1.5">
        {/* Left: Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={onNavigatePrev}
            disabled={!canNavigatePrev}
            className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Previous (Left Arrow)"
          >
            <Icon name="chevronLeft" size={16} />
          </button>
          <span className="text-xs text-neutral-500 min-w-[3rem] text-center">
            {currentIndex + 1} / {assetListLength}
          </span>
          <button
            onClick={onNavigateNext}
            disabled={!canNavigateNext}
            className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Next (Right Arrow)"
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>

        {/* Center: Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={onZoomOut}
            disabled={zoom <= 25}
            className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Zoom Out"
          >
            <Icon name="minus" size={14} />
          </button>
          <button
            onClick={onResetZoom}
            className="px-2 py-0.5 text-[10px] font-mono hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded"
            title="Reset Zoom"
          >
            {zoom}%
          </button>
          <button
            onClick={onZoomIn}
            disabled={zoom >= 400}
            className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Zoom In"
          >
            <Icon name="plus" size={14} />
          </button>
        </div>

        {/* Right: Fit modes, overlays, and maximize */}
        <div className="flex items-center gap-2">
          {/* Fit modes - hide when overlay mode is active */}
          {!isOverlayActive && (
            <div className="flex items-center gap-1">
              {(['contain', 'cover', 'actual'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onFitModeChange(mode)}
                  className={`px-2 py-0.5 text-[10px] rounded ${
                    fitMode === mode
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                  title={`Fit: ${mode}`}
                >
                  {mode}
                </button>
              ))}
            </div>
          )}

          {onToggleOverlay && overlayList.map((tool) => {
            const isActive = overlayMode === tool.id;
            const tone = tool.tone ?? 'blue';
            const activeClass = toneClasses[tone];
            const baseClass = 'px-2 py-0.5 text-[10px] rounded';
            const title = tool.shortcut
              ? `${tool.label} (${tool.shortcut})`
              : tool.label;

            return (
              <button
                key={tool.id}
                onClick={() => onToggleOverlay(tool.id)}
                className={`${baseClass} ${
                  isActive
                    ? activeClass
                    : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
                title={isActive ? `Exit ${tool.label.toLowerCase()}` : title}
              >
                {tool.label}
              </button>
            );
          })}

          {/* Maximize/Restore button */}
          <button
            onClick={onToggleMaximize}
            className={`px-2 py-0.5 text-[10px] rounded ${
              isMaximized
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
            title={isMaximized ? 'Restore' : 'Maximize Preview'}
          >
            {isMaximized ? '⬇' : '⬆'}
          </button>
        </div>
      </div>
    </div>
  );
}

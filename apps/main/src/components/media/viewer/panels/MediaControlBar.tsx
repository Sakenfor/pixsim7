/**
 * MediaControlBar
 *
 * Unified control bar for media viewer with navigation, zoom, fit, and maximize controls.
 * Overlay tool toggles have moved to ViewerToolStrip.
 */

import { Dropdown, DropdownItem } from '@pixsim7/shared.ui';
import { useRef, useState } from 'react';

import { Icon } from '@lib/icons';

import type { FitMode } from './MediaDisplay';

export interface ScopeItem {
  id: string;
  label: string;
  count: number;
  active: boolean;
}

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

  // Overlay active (hides fit modes)
  isOverlayActive?: boolean;

  // Capture
  showCapture?: boolean;
  captureDisabled?: boolean;
  onCaptureFrame?: () => void;

  // Scope switcher
  scopeLabel?: string;
  scopes?: ScopeItem[];
  onSwitchScope?: (id: string) => void;
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
  isOverlayActive,
  showCapture,
  captureDisabled,
  onCaptureFrame,
  scopeLabel,
  scopes,
  onSwitchScope,
}: MediaControlBarProps) {
  const [scopeDropdownOpen, setScopeDropdownOpen] = useState(false);
  const scopeTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="flex-shrink-0 border-t border-neutral-200 dark:border-neutral-700">
      <div className="flex items-center justify-between px-3 py-1.5">
        {/* Left: Navigation + scope */}
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

          {/* Scope switcher — always a dropdown for discoverability */}
          {scopeLabel && (
            <>
              <div className="h-3.5 w-px bg-neutral-200 dark:bg-neutral-700 mx-0.5" />
              <div className="relative">
                <button
                  ref={scopeTriggerRef}
                  onClick={() => setScopeDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
                  title="Navigation scope"
                >
                  <span className="truncate max-w-[140px]">{scopeLabel}</span>
                  <Icon name="chevronDown" size={10} />
                </button>
                {scopes && scopes.length > 0 && (
                  <Dropdown
                    isOpen={scopeDropdownOpen}
                    onClose={() => setScopeDropdownOpen(false)}
                    position="top-left"
                    minWidth="160px"
                    triggerRef={scopeTriggerRef}
                  >
                    {scopes.map((scope) => (
                      <DropdownItem
                        key={scope.id}
                        onClick={() => {
                          onSwitchScope?.(scope.id);
                          setScopeDropdownOpen(false);
                        }}
                        icon={scope.active ? <Icon name="check" size={10} /> : <span className="w-[10px]" />}
                      >
                        {scope.label}
                      </DropdownItem>
                    ))}
                  </Dropdown>
                )}
              </div>
            </>
          )}
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

        {/* Right: Fit modes, capture, and maximize */}
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
                      ? 'bg-accent-subtle text-accent'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                  title={`Fit: ${mode}`}
                >
                  {mode}
                </button>
              ))}
            </div>
          )}

          {showCapture && onCaptureFrame && (
            <button
              onClick={() => onCaptureFrame()}
              disabled={captureDisabled}
              className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Capture Frame"
            >
              <Icon name="camera" size={14} />
            </button>
          )}

          {/* Maximize/Restore button */}
          <button
            onClick={onToggleMaximize}
            className={`px-2 py-0.5 text-[10px] rounded ${
              isMaximized
                ? 'bg-accent-subtle text-accent'
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

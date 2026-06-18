/**
 * MediaControlBar
 *
 * Unified control bar for media viewer with navigation, zoom, fit, and maximize controls.
 * Overlay tool toggles have moved to ViewerToolStrip.
 */

import { Dropdown, DropdownDivider, DropdownItem } from '@pixsim7/shared.ui';
import { useCallback, useMemo, useRef, useState } from 'react';

import { Icon, type IconName } from '@lib/icons';

import { useAssetViewerStore } from '@features/assets';

import type { FitMode } from './MediaDisplay';

/**
 * Per-scope icon, keyed by the stable `scopeId` each scope registers under.
 * Cohort scopes mirror the input-slot CohortPill glyphs (clock / messageSquare
 * / folder). A scope id without an entry simply renders no icon. Add a scope's
 * icon here, or set `ScopeItem.icon` to override per-registration.
 */
const SCOPE_ICONS: Partial<Record<string, IconName>> = {
  'around-time': 'clock',
  'same-prompt': 'messageSquare',
  'same-folder': 'folder',
  recent: 'sparkles',
  history: 'history',
  probes: 'flask',
  gallery: 'image',
  local: 'folder',
  'mini-gallery': 'image',
  generation: 'wand',
};

const scopeIconFor = (item: { id: string; icon?: IconName }): IconName | undefined =>
  item.icon ?? SCOPE_ICONS[item.id];

export interface ScopeItem {
  id: string;
  label: string;
  count: number;
  active: boolean;
  /** Optional per-registration icon override; falls back to SCOPE_ICONS[id]. */
  icon?: IconName;
}

/**
 * Self-subscribing navigation-scope switcher.
 *
 * Subscribes to the viewer store directly rather than receiving scope data as
 * props, so the (legitimately per-arrival changing) scope counts re-render only
 * this small toolbar fragment — NOT the whole `MediaPanel` subtree
 * (MediaDisplay, overlays, etc.). During a generation burst the active scope's
 * asset count ticks up on every arrival; routing that through MediaPanel
 * defeated the store's careful "don't swap currentAsset while parked" coalescing.
 */
function ScopeSwitcher() {
  const scopes = useAssetViewerStore((s) => s.scopes);
  const activeScopeId = useAssetViewerStore((s) => s.activeScopeId);
  const switchScope = useAssetViewerStore((s) => s.switchScope);
  const followLatest = useAssetViewerStore((s) => s.settings.followLatest);
  const scopeLocked = useAssetViewerStore((s) => s.settings.scopeLocked);
  const updateSettings = useAssetViewerStore((s) => s.updateSettings);

  const [scopeDropdownOpen, setScopeDropdownOpen] = useState(false);
  const scopeTriggerRef = useRef<HTMLButtonElement>(null);

  const scopeItems = useMemo<ScopeItem[]>(
    () =>
      Object.entries(scopes).map(([id, scope]) => ({
        id,
        label: scope.label,
        count: scope.assets.length,
        active: id === activeScopeId,
      })),
    [scopes, activeScopeId],
  );

  const scopeLabel = activeScopeId ? scopes[activeScopeId]?.label : undefined;
  const toggleFollowLatest = useCallback(
    () => updateSettings({ followLatest: !followLatest }),
    [followLatest, updateSettings],
  );
  const toggleScopeLock = useCallback(
    () => updateSettings({ scopeLocked: !scopeLocked }),
    [scopeLocked, updateSettings],
  );

  if (!scopeLabel) return null;

  return (
    <>
      <div className="h-3.5 w-px bg-neutral-200 dark:bg-neutral-700 mx-0.5" />
      <div className="relative">
        <button
          ref={scopeTriggerRef}
          onClick={() => setScopeDropdownOpen((prev) => !prev)}
          className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
          title={scopeLocked ? 'Navigation scope (locked)' : 'Navigation scope'}
        >
          {scopeLocked && <Icon name="lock" size={10} />}
          {(() => {
            const active = scopeItems.find((s) => s.active);
            const icon = active ? scopeIconFor(active) : undefined;
            return icon ? <Icon name={icon} size={11} /> : null;
          })()}
          <span className="truncate max-w-[140px]">{scopeLabel}</span>
          <Icon name="chevronDown" size={10} />
        </button>
        {scopeItems.length > 0 && (
          <Dropdown
            isOpen={scopeDropdownOpen}
            onClose={() => setScopeDropdownOpen(false)}
            position="top-left"
            minWidth="160px"
            triggerRef={scopeTriggerRef}
          >
            {scopeItems.map((scope) => {
              const scopeIcon = scopeIconFor(scope);
              return (
                <DropdownItem
                  key={scope.id}
                  onClick={() => {
                    switchScope(scope.id);
                    setScopeDropdownOpen(false);
                  }}
                  // Active row shows a check; inactive rows show the
                  // scope's own icon (the active scope's icon still
                  // shows in the trigger above).
                  icon={
                    scope.active ? (
                      <Icon name="check" size={10} />
                    ) : scopeIcon ? (
                      <Icon name={scopeIcon} size={10} />
                    ) : (
                      <span className="w-[10px]" />
                    )
                  }
                >
                  {scope.label}
                </DropdownItem>
              );
            })}
            <DropdownDivider />
            <DropdownItem
              onClick={toggleFollowLatest}
              icon={followLatest ? <Icon name="check" size={10} /> : <span className="w-[10px]" />}
            >
              Follow latest
            </DropdownItem>
            <DropdownItem
              onClick={toggleScopeLock}
              icon={scopeLocked ? <Icon name="check" size={10} /> : <span className="w-[10px]" />}
            >
              Lock scope
            </DropdownItem>
          </Dropdown>
        )}
      </div>
    </>
  );
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
}: MediaControlBarProps) {
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

          {/* Scope switcher — self-subscribing so per-arrival count changes
              don't re-render the parent MediaPanel. */}
          <ScopeSwitcher />
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

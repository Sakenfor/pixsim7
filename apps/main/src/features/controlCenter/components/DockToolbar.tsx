/**
 * DockToolbar Component
 *
 * Compact toolbar for the control center dock header.
 * Includes quick navigation shortcuts, position controls, and notifications.
 */

/* eslint-disable react-refresh/only-export-components */

import { ExpandableButtonGroup, Popover, useOrientation } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useCallback, useMemo, useState, useRef } from 'react';

import { Icon } from '@lib/icons';

import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import {
  useDockState,
  useDockUiStore,
  type DockPosition,
  type LayoutBehavior,
  type RetractedMode,
} from '@features/docks/stores';
import { NotificationTicker, ContentModerationWarning } from '@features/generation';
import { DOCK_IDS } from '@features/panels/lib/panelIds';

/** Quick navigation item configuration */
export interface QuickNavItem {
  id: string;
  icon: string;
  label: string;
  path: string;
}

/** Default quick navigation items */
export const DEFAULT_QUICK_NAV: QuickNavItem[] = [
  { id: 'gallery', icon: '🖼️', label: 'Gallery', path: '/assets' },
  { id: 'workspace', icon: '🎨', label: 'Workspace', path: '/workspace' },
  { id: 'devtools', icon: 'code', label: 'DevTools', path: '/dev/developer-tasks' },
  { id: 'home', icon: '🏠', label: 'Home', path: '/' },
  { id: 'graph', icon: '🕸️', label: 'Graph', path: '/graph/1' },
];

interface DockToolbarProps {
  /** Current dock position */
  dockPosition: DockPosition;
  /** Callback when dock position changes */
  onDockPositionChange: (position: DockPosition) => void;
  /** Whether dock is pinned */
  pinned: boolean;
  /** Callback to toggle pinned state */
  onPinnedToggle: () => void;
  /** Navigation function */
  navigate: (path: string) => void;
  /** Quick navigation items (defaults to DEFAULT_QUICK_NAV) */
  quickNavItems?: QuickNavItem[];
  /** Whether to show quick navigation */
  showQuickNav?: boolean;
}

export function DockToolbar({
  dockPosition,
  onDockPositionChange,
  pinned,
  onPinnedToggle,
  navigate,
  quickNavItems = DEFAULT_QUICK_NAV,
  showQuickNav = true,
}: DockToolbarProps) {
  // Smart expand direction based on dock position
  const expandDirection = useMemo(() => {
    switch (dockPosition) {
      case 'top': return 'down';
      case 'bottom': return 'up';
      case 'left': return 'right';
      case 'right': return 'left';
      default: return 'up';
    }
  }, [dockPosition]);

  // Get position icon
  const positionIcon = useMemo(() => {
    switch (dockPosition) {
      case 'bottom': return '⬇';
      case 'top': return '⬆';
      case 'left': return '⬅';
      case 'right': return '➡';
      case 'floating': return '⊡';
      default: return '⬇';
    }
  }, [dockPosition]);

  // Dropdown state
  const [showDropdown, setShowDropdown] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Store actions for inline settings
  const triggerDockLayoutReset = useDockUiStore((s) => s.triggerDockLayoutReset);
  const setDockRetractedMode = useDockUiStore((s) => s.setDockRetractedMode);
  const setDockLayoutBehavior = useDockUiStore((s) => s.setDockLayoutBehavior);
  const setDockOpen = useDockUiStore((s) => s.setDockOpen);
  const collapseDock = useCallback(
    () => setDockOpen(DOCK_IDS.controlCenter, false),
    [setDockOpen],
  );
  const retractedMode = useDockState(
    DOCK_IDS.controlCenter,
    (dock) => dock.retractedMode,
  );
  const layoutBehavior = useDockState(
    DOCK_IDS.controlCenter,
    (dock) => dock.layoutBehavior,
  );
  const triggerPanelLayoutReset = useCallback(
    () => triggerDockLayoutReset(DOCK_IDS.controlCenter),
    [triggerDockLayoutReset],
  );
  const setRetractedMode = useCallback(
    (mode: RetractedMode) => setDockRetractedMode(DOCK_IDS.controlCenter, mode),
    [setDockRetractedMode],
  );
  const setLayoutBehavior = useCallback(
    (behavior: LayoutBehavior) =>
      setDockLayoutBehavior(DOCK_IDS.controlCenter, behavior),
    [setDockLayoutBehavior],
  );
  const conformToOtherPanels = useControlCenterStore(s => s.conformToOtherPanels);
  const setConformToOtherPanels = useControlCenterStore(s => s.setConformToOtherPanels);

  const { isVertical } = useOrientation();

  // Popover placement based on dock position
  const menuPlacement = useMemo(() => {
    if (isVertical) return dockPosition === 'right' ? 'left' as const : 'right' as const;
    return 'bottom' as const;
  }, [isVertical, dockPosition]);

  return (
    <div className={clsx(
      'control-center-header flex items-center border-white/10 cursor-move flex-shrink-0',
      isVertical
        ? 'flex-col gap-1.5 border-r w-8 px-1 py-2 bg-gradient-to-b from-neutral-50/90 via-white/40 to-neutral-50/90 dark:from-neutral-800/90 dark:via-neutral-900/40 dark:to-neutral-800/90'
        : 'gap-2 border-b px-3 py-1.5 bg-gradient-to-r from-neutral-50/90 via-white/40 to-neutral-50/90 dark:from-neutral-800/90 dark:via-neutral-900/40 dark:to-neutral-800/90'
    )}>
      {/* Title with dropdown */}
      <div className="relative">
        <button
          ref={triggerRef}
          onClick={() => setShowDropdown(!showDropdown)}
          className={clsx(
            'hover:opacity-80 transition-opacity flex items-center',
            isVertical
              ? 'p-1 rounded hover:bg-white/10'
              : 'text-xs font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent gap-1'
          )}
          title="Control Center Menu"
        >
          {isVertical ? (
            <Icon name="settings" size={14} />
          ) : (
            <>
              Control Center
              <span className="text-[8px] opacity-50">▼</span>
            </>
          )}
        </button>

        {/* Dropdown menu — portaled to body so it escapes the CC stacking context */}
        <Popover
          anchor={triggerRef.current}
          placement={menuPlacement}
          align="start"
          offset={4}
          open={showDropdown}
          onClose={() => setShowDropdown(false)}
          triggerRef={triggerRef}
          className="w-56 bg-white dark:bg-neutral-800 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-700 py-1"
        >
          {/* Panel Management Section */}
          <div className="px-3 py-1.5 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
            Panels
          </div>
          <button
            onClick={() => {
              triggerPanelLayoutReset();
              setShowDropdown(false);
            }}
            className="w-full px-3 py-1.5 text-xs text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
          >
            <span>🔄</span>
            <span>Reset Panel Layout</span>
          </button>

          <div className="border-t border-neutral-200 dark:border-neutral-700 my-1"></div>

          {/* Settings Section */}
          <div className="px-3 py-1.5 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
            Settings
          </div>

          {/* Retracted Mode */}
          <div className="px-3 py-1.5">
            <div className="text-xs text-neutral-600 dark:text-neutral-300 mb-1">When retracted</div>
            <div className="flex gap-1">
              <ToggleButton
                active={retractedMode === 'hidden'}
                onClick={() => setRetractedMode('hidden')}
                label="Hidden"
              />
              <ToggleButton
                active={retractedMode === 'peek'}
                onClick={() => setRetractedMode('peek')}
                label="Show toolbar"
              />
            </div>
          </div>

          {/* Layout Behavior */}
          <div className="px-3 py-1.5">
            <div className="text-xs text-neutral-600 dark:text-neutral-300 mb-1">Layout</div>
            <div className="flex gap-1">
              <ToggleButton
                active={layoutBehavior === 'overlay'}
                onClick={() => setLayoutBehavior('overlay')}
                label="Overlay"
              />
              <ToggleButton
                active={layoutBehavior === 'push'}
                onClick={() => setLayoutBehavior('push')}
                label="Push"
              />
            </div>
          </div>

          {/* Conform to Panels */}
          <label className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700">
            <input
              type="checkbox"
              checked={conformToOtherPanels}
              onChange={(e) => setConformToOtherPanels(e.target.checked)}
              className="rounded border-neutral-300 dark:border-neutral-600 text-accent focus:ring-accent"
            />
            <span className="text-xs text-neutral-600 dark:text-neutral-300">Conform to panels</span>
          </label>
        </Popover>
      </div>

      {/* Inline Quick Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={onPinnedToggle}
          className={clsx(
            'text-xs px-1.5 py-0.5 rounded transition-colors',
            pinned
              ? 'bg-amber-100 dark:bg-amber-900/30'
              : 'hover:bg-accent-subtle'
          )}
          title={pinned ? 'Unpin' : 'Pin'}
          aria-pressed={pinned}
        >
          {pinned ? '📌' : '📍'}
        </button>
        <button
          onClick={collapseDock}
          className="text-xs px-1.5 py-0.5 rounded transition-colors hover:bg-accent-subtle leading-none"
          title="Collapse"
          aria-label="Collapse control center"
        >
          ✕
        </button>
      </div>

      {/* News ticker for generation events (horizontal only) */}
      {!isVertical && <NotificationTicker />}

      {/* Content moderation warnings (horizontal only) */}
      {!isVertical && <ContentModerationWarning />}

      <div className={clsx(
        'flex items-center',
        isVertical ? 'mt-auto flex-col gap-1.5' : 'ml-auto gap-2'
      )}>
        {/* Quick Navigation Shortcuts */}
        {showQuickNav && quickNavItems.length > 0 && (
          <div className={clsx('flex items-center gap-0.5', isVertical && 'flex-col')}>
            {quickNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={clsx(
                  'text-xs rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors',
                  isVertical ? 'p-1' : 'px-1.5 py-0.5'
                )}
                title={item.label}
                aria-label={`Navigate to ${item.label}`}
              >
                <Icon name={item.icon} size={isVertical ? 14 : 16} />
              </button>
            ))}
          </div>
        )}

        {/* Dock Position Selector */}
        <ExpandableButtonGroup
          trigger={
            <button
              className={clsx(
                'text-xs border border-neutral-300/50 dark:border-neutral-600/50 rounded-lg bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all hover:scale-105 active:scale-95',
                isVertical ? 'p-1' : 'px-2 py-1'
              )}
              aria-label={`Dock position: ${dockPosition}`}
            >
              {positionIcon}
            </button>
          }
          direction={expandDirection}
          hoverDelay={200}
          offset={6}
          {...(!isVertical && { contentClassName: 'right-0' })}
        >
          <div className={clsx(
            'flex gap-2 p-2 rounded-lg bg-neutral-900/95 backdrop-blur-sm shadow-2xl border border-neutral-700',
            isVertical ? 'flex-col items-center' : 'items-center'
          )}>
            <PositionButton
              position="top"
              icon="⬆"
              currentPosition={dockPosition}
              onClick={onDockPositionChange}
            />
            <PositionButton
              position="left"
              icon="⬅"
              currentPosition={dockPosition}
              onClick={onDockPositionChange}
            />
            <PositionButton
              position="floating"
              icon="⊡"
              currentPosition={dockPosition}
              onClick={onDockPositionChange}
              variant="purple"
            />
            <PositionButton
              position="right"
              icon="➡"
              currentPosition={dockPosition}
              onClick={onDockPositionChange}
            />
            <PositionButton
              position="bottom"
              icon="⬇"
              currentPosition={dockPosition}
              onClick={onDockPositionChange}
            />
          </div>
        </ExpandableButtonGroup>
      </div>
    </div>
  );
}

/** Toggle button for inline settings */
function ToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex-1 px-2 py-1 text-[11px] rounded transition-colors',
        active
          ? 'bg-accent text-accent-text'
          : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600'
      )}
    >
      {label}
    </button>
  );
}

/** Position button for the dock position selector */
function PositionButton({
  position,
  icon,
  currentPosition,
  onClick,
  variant = 'blue',
}: {
  position: DockPosition;
  icon: string;
  currentPosition: DockPosition;
  onClick: (position: DockPosition) => void;
  variant?: 'blue' | 'purple';
}) {
  const isActive = currentPosition === position;
  const activeColor = variant === 'purple' ? 'bg-purple-600' : 'bg-accent';
  const hoverColor = variant === 'purple' ? 'hover:bg-purple-600/80' : 'hover:bg-accent-hover';

  return (
    <button
      onClick={() => onClick(position)}
      className={clsx(
        'w-8 h-8 rounded transition-all flex items-center justify-center text-sm',
        isActive ? `${activeColor} text-white` : `${hoverColor} text-white`
      )}
      title={`Dock ${position.charAt(0).toUpperCase() + position.slice(1)}`}
      aria-pressed={isActive}
    >
      {icon}
    </button>
  );
}

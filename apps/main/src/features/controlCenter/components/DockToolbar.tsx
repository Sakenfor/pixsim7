/**
 * DockToolbar Component
 *
 * Compact toolbar for the control center dock header.
 * Includes quick navigation shortcuts, position controls, and notifications.
 */

/* eslint-disable react-refresh/only-export-components */

import { ExpandableButtonGroup } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useMemo, useState, useRef, useEffect } from 'react';

import { Icon } from '@lib/icons';

import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import type { DockPosition } from '@features/controlCenter/stores/controlCenterStore';
import { NotificationTicker, ContentModerationWarning } from '@features/generation';

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
  { id: 'plugin-workspace', icon: '🔌', label: 'Plugin Workspace', path: '/plugin-workspace' },
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
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Store actions for inline settings
  const triggerPanelLayoutReset = useControlCenterStore(s => s.triggerPanelLayoutReset);
  const retractedMode = useControlCenterStore(s => s.retractedMode);
  const setRetractedMode = useControlCenterStore(s => s.setRetractedMode);
  const layoutBehavior = useControlCenterStore(s => s.layoutBehavior);
  const setLayoutBehavior = useControlCenterStore(s => s.setLayoutBehavior);
  const conformToOtherPanels = useControlCenterStore(s => s.conformToOtherPanels);
  const setConformToOtherPanels = useControlCenterStore(s => s.setConformToOtherPanels);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  return (
    <div className="control-center-header px-3 py-1.5 flex items-center gap-2 border-b border-white/10 bg-gradient-to-r from-neutral-50/90 via-white/40 to-neutral-50/90 dark:from-neutral-800/90 dark:via-neutral-900/40 dark:to-neutral-800/90 cursor-move flex-shrink-0">
      {/* Title with dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="text-xs font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent hover:opacity-80 transition-opacity flex items-center gap-1"
          title="Control Center Menu"
        >
          Control Center
          <span className="text-[8px] opacity-50">▼</span>
        </button>

        {/* Dropdown menu */}
        {showDropdown && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-neutral-800 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-700 py-1 z-50">
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
          </div>
        )}
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
      </div>

      {/* News ticker for generation events */}
      <NotificationTicker />

      {/* Content moderation warnings */}
      <ContentModerationWarning />

      <div className="ml-auto flex items-center gap-2">
        {/* Quick Navigation Shortcuts */}
        {showQuickNav && quickNavItems.length > 0 && (
          <div className="flex items-center gap-0.5">
            {quickNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className="text-xs px-1.5 py-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                title={item.label}
                aria-label={`Navigate to ${item.label}`}
              >
                <Icon name={item.icon} size={16} />
              </button>
            ))}
          </div>
        )}

        {/* Dock Position Selector */}
        <ExpandableButtonGroup
          trigger={
            <button
              className="text-xs px-2 py-1 border border-neutral-300/50 dark:border-neutral-600/50 rounded-lg bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all hover:scale-105 active:scale-95"
              aria-label={`Dock position: ${dockPosition}`}
            >
              {positionIcon}
            </button>
          }
          direction={expandDirection}
          hoverDelay={200}
          offset={6}
          contentClassName="right-0"
        >
          <div className="flex items-center gap-2 p-2 rounded-lg bg-neutral-900/95 backdrop-blur-sm shadow-2xl border border-neutral-700">
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


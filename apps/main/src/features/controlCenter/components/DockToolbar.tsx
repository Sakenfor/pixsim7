/**
 * DockToolbar Component
 *
 * Compact toolbar for the control center dock header.
 * Includes module tabs, quick navigation, and position controls.
 */

import { useMemo } from 'react';
import clsx from 'clsx';
import { ExpandableButtonGroup } from '@pixsim7/shared.ui';
import type { ControlModule, DockPosition } from '@features/controlCenter/stores/controlCenterStore';
import type { ControlCenterModule } from '@features/controlCenter/lib/controlCenterModuleRegistry';
import { GenerationHistoryButton } from '../generation/GenerationHistoryButton';
import { NotificationTicker } from './NotificationTicker';

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
  { id: 'home', icon: '🏠', label: 'Home', path: '/' },
  { id: 'graph', icon: '🕸️', label: 'Graph', path: '/graph/1' },
];

interface DockToolbarProps {
  /** Available modules to display as tabs */
  modules: ControlCenterModule[];
  /** Currently active module */
  activeModule: ControlModule;
  /** Callback when module is selected */
  onModuleSelect: (moduleId: ControlModule) => void;
  /** Current dock position */
  dockPosition: DockPosition;
  /** Callback when dock position changes */
  onDockPositionChange: (position: DockPosition) => void;
  /** Whether dock is pinned */
  pinned: boolean;
  /** Callback to toggle pinned state */
  onPinnedToggle: () => void;
  /** Callback to toggle mode (dock/cubes) */
  onModeToggle: () => void;
  /** Navigation function */
  navigate: (path: string) => void;
  /** Quick navigation items (defaults to DEFAULT_QUICK_NAV) */
  quickNavItems?: QuickNavItem[];
  /** Whether to show quick navigation */
  showQuickNav?: boolean;
}

export function DockToolbar({
  modules,
  activeModule,
  onModuleSelect,
  dockPosition,
  onDockPositionChange,
  pinned,
  onPinnedToggle,
  onModeToggle,
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

  return (
    <div className="control-center-header px-3 py-1.5 flex items-center gap-2 border-b border-white/10 bg-gradient-to-r from-neutral-50/90 via-white/40 to-neutral-50/90 dark:from-neutral-800/90 dark:via-neutral-900/40 dark:to-neutral-800/90 cursor-move">
      {/* Title */}
      <span className="text-xs font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
        Control Center
      </span>

      {/* Inline Quick Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={onModeToggle}
          className="text-xs px-1.5 py-0.5 rounded hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
          title="Switch Mode"
        >
          🎲
        </button>
        <button
          onClick={onPinnedToggle}
          className={clsx(
            'text-xs px-1.5 py-0.5 rounded transition-colors',
            pinned
              ? 'bg-amber-100 dark:bg-amber-900/30'
              : 'hover:bg-blue-100 dark:hover:bg-blue-900/30'
          )}
          title={pinned ? 'Unpin' : 'Pin'}
          aria-pressed={pinned}
        >
          {pinned ? '📌' : '📍'}
        </button>
      </div>

      {/* News ticker for generation events */}
      <NotificationTicker />

      <div className="flex-1" />

      {/* Quick Navigation Shortcuts */}
      {showQuickNav && quickNavItems.length > 0 && (
        <div className="flex items-center gap-0.5 mr-2">
          {quickNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className="text-xs px-1.5 py-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
              title={item.label}
              aria-label={`Navigate to ${item.label}`}
            >
              {item.icon}
            </button>
          ))}
        </div>
      )}

      {/* Module tabs */}
      <div
        className="flex gap-1 flex-wrap"
        role="tablist"
        aria-label="Control center modules"
        onKeyDown={(e) => {
          // Keyboard navigation between tabs
          const tabs = modules.map((m) => m.id);
          const currentIndex = tabs.indexOf(activeModule);

          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIndex = (currentIndex + 1) % tabs.length;
            onModuleSelect(tabs[nextIndex] as ControlModule);
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
            onModuleSelect(tabs[prevIndex] as ControlModule);
          } else if (e.key === 'Home') {
            e.preventDefault();
            onModuleSelect(tabs[0] as ControlModule);
          } else if (e.key === 'End') {
            e.preventDefault();
            onModuleSelect(tabs[tabs.length - 1] as ControlModule);
          }
        }}
      >
        {modules.map((mod, index) => {
          const isActive = activeModule === mod.id;
          return (
            <button
              key={mod.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`module-${mod.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onModuleSelect(mod.id as ControlModule)}
              className={clsx(
                'text-xs px-2 py-1 rounded-lg transition-all duration-200 whitespace-nowrap',
                'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1',
                'transform hover:scale-105 active:scale-95',
                isActive
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-purple-500/30'
                  : 'bg-neutral-200/50 dark:bg-neutral-700/50 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:shadow-md'
              )}
              title={mod.description}
            >
              <span className="mr-1">{mod.icon}</span>
              {mod.label}
            </button>
          );
        })}
      </div>

      <div className="w-px h-4 bg-gradient-to-b from-transparent via-neutral-300 to-transparent dark:via-neutral-600" />

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
  const activeColor = variant === 'purple' ? 'bg-purple-600' : 'bg-blue-600';
  const hoverColor = variant === 'purple' ? 'hover:bg-purple-600/80' : 'hover:bg-blue-600/80';

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

/**
 * Header Widget Area
 *
 * Renders widgets placed in a header area (left/center/right).
 * Provides right-click context menu to add/remove widgets.
 */

import { useState, useCallback, useMemo } from 'react';

import { Icon } from '@lib/icons';

import type { WidgetInstance, WidgetDefinition, HeaderArea } from '../types';
import {
  useWidgetPlacementStore,
  useWidgetInstances,
} from '../widgetPlacementStore';
import { getWidget, getWidgetMenuItems } from '../widgetRegistry';

interface HeaderWidgetAreaProps {
  /** Which area of the header (left, center, right) */
  area: HeaderArea;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Renders a single widget instance
 */
function WidgetRenderer({ instance }: { instance: WidgetInstance }) {
  const widgetDef = getWidget(instance.widgetId);
  const updateSettings = useWidgetPlacementStore(
    (state) => state.updateInstanceSettings
  );

  if (!widgetDef) {
    return null;
  }

  const Component = widgetDef.component;

  return (
    <Component
      instanceId={instance.id}
      settings={instance.settings || widgetDef.defaultSettings || {}}
      surface="header"
      onSettingsChange={(newSettings) => {
        updateSettings(instance.id, newSettings);
      }}
    />
  );
}

/**
 * Context menu for adding widgets
 */
function AddWidgetMenu({
  area,
  onClose,
  position,
}: {
  area: HeaderArea;
  onClose: () => void;
  position: { x: number; y: number };
}) {
  const addInstance = useWidgetPlacementStore((state) => state.addInstance);
  const menuItems = getWidgetMenuItems('header');

  const handleAddWidget = (widgetDef: WidgetDefinition) => {
    const instanceId = `${widgetDef.id}-${Date.now()}`;
    addInstance({
      id: instanceId,
      widgetId: widgetDef.id,
      surface: 'header',
      placement: { area },
      settings: widgetDef.defaultSettings,
    });
    onClose();
  };

  // Filter to only categories that have widgets
  const nonEmptyCategories = Object.entries(menuItems).filter(
    ([, widgets]) => widgets.length > 0
  );

  if (nonEmptyCategories.length === 0) {
    return (
      <div
        className="fixed z-50 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg p-2 text-sm"
        style={{ left: position.x, top: position.y }}
      >
        <div className="px-2 py-1 text-neutral-500">No widgets available</div>
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Menu */}
      <div
        className="fixed z-50 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg py-1 min-w-[160px]"
        style={{ left: position.x, top: position.y }}
      >
        <div className="px-3 py-1 text-xs font-semibold text-neutral-500 uppercase">
          Add Widget
        </div>
        {nonEmptyCategories.map(([category, widgets]) => (
          <div key={category}>
            <div className="px-3 py-1 text-xs text-neutral-400 capitalize border-t border-neutral-100 dark:border-neutral-700 mt-1">
              {category}
            </div>
            {widgets.map((widget) => (
              <button
                key={widget.id}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
                onClick={() => handleAddWidget(widget)}
              >
                {widget.icon && <Icon name={widget.icon} size={16} />}
                <span>{widget.title}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Header Widget Area Component
 *
 * Renders widgets for a specific header area and provides context menu to add widgets.
 */
export function HeaderWidgetArea({ area, className = '' }: HeaderWidgetAreaProps) {
  const instances = useWidgetInstances('header', area);
  const removeInstance = useWidgetPlacementStore((state) => state.removeInstance);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(
    null
  );
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

  // Sort instances by priority (from widget definition)
  const sortedInstances = useMemo(() => {
    return [...instances].sort((a, b) => {
      const defA = getWidget(a.widgetId);
      const defB = getWidget(b.widgetId);
      const priorityA = defA?.surfaceConfig?.header?.priority ?? 50;
      const priorityB = defB?.surfaceConfig?.header?.priority ?? 50;
      return priorityA - priorityB;
    });
  }, [instances]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, instanceId?: string) => {
      e.preventDefault();
      setMenuPosition({ x: e.clientX, y: e.clientY });
      setSelectedInstanceId(instanceId || null);
    },
    []
  );

  const handleCloseMenu = useCallback(() => {
    setMenuPosition(null);
    setSelectedInstanceId(null);
  }, []);

  const handleRemoveWidget = useCallback(() => {
    if (selectedInstanceId) {
      removeInstance(selectedInstanceId);
    }
    handleCloseMenu();
  }, [selectedInstanceId, removeInstance, handleCloseMenu]);

  return (
    <div
      className={`flex items-center ${className}`}
      onContextMenu={(e) => handleContextMenu(e)}
    >
      {sortedInstances.map((instance) => (
        <div
          key={instance.id}
          onContextMenu={(e) => {
            e.stopPropagation();
            handleContextMenu(e, instance.id);
          }}
        >
          <WidgetRenderer instance={instance} />
        </div>
      ))}

      {/* Context menu */}
      {menuPosition && !selectedInstanceId && (
        <AddWidgetMenu
          area={area}
          onClose={handleCloseMenu}
          position={menuPosition}
        />
      )}

      {/* Instance context menu */}
      {menuPosition && selectedInstanceId && (
        <>
          <div className="fixed inset-0 z-40" onClick={handleCloseMenu} />
          <div
            className="fixed z-50 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg py-1 min-w-[120px]"
            style={{ left: menuPosition.x, top: menuPosition.y }}
          >
            <button
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
              onClick={handleRemoveWidget}
            >
              Remove Widget
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Complete header widget bar with left, center, right areas
 */
export function HeaderWidgetBar({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-between w-full ${className}`}>
      <HeaderWidgetArea area="left" className="flex-shrink-0" />
      <HeaderWidgetArea area="center" className="flex-1 justify-center" />
      <HeaderWidgetArea area="right" className="flex-shrink-0" />
    </div>
  );
}

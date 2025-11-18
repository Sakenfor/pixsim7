/**
 * Plugin Overlays Renderer
 *
 * Renders all active plugin overlays, menu items, and notifications on the game screen.
 * This component should be mounted at the App level to ensure overlays appear above all content.
 */

import { useState, useEffect, useCallback } from 'react';
import { pluginManager } from '../lib/plugins';
import type { PluginOverlay, PluginMenuItem, PluginNotification } from '../lib/plugins/types';

export function PluginOverlays() {
  const [overlays, setOverlays] = useState<PluginOverlay[]>([]);
  const [menuItems, setMenuItems] = useState<PluginMenuItem[]>([]);
  const [notifications, setNotifications] = useState<PluginNotification[]>([]);
  const [updateCounter, setUpdateCounter] = useState(0);

  // Update overlays
  const updateOverlays = useCallback(() => {
    setOverlays(pluginManager.getOverlays());
    setUpdateCounter((c) => c + 1);
  }, []);

  // Update menu items
  const updateMenuItems = useCallback(() => {
    setMenuItems(pluginManager.getMenuItems());
  }, []);

  // Handle plugin notifications
  const handleNotification = useCallback((notification: PluginNotification) => {
    const id = notification.id || `notif-${Date.now()}-${Math.random()}`;
    const notif = { ...notification, id };

    setNotifications((prev) => [...prev, notif]);

    // Auto-dismiss after duration
    if (notification.duration !== 0) {
      const duration = notification.duration || 3000;
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, duration);
    }
  }, []);

  useEffect(() => {
    // Initial load
    updateOverlays();
    updateMenuItems();

    // Register callbacks
    pluginManager.setUICallbacks({
      onOverlaysChange: updateOverlays,
      onMenuItemsChange: updateMenuItems,
      onNotification: handleNotification,
    });

    return () => {
      // Cleanup: unset callbacks
      pluginManager.setUICallbacks({
        onOverlaysChange: undefined,
        onMenuItemsChange: undefined,
        onNotification: undefined,
      });
    };
  }, [updateOverlays, updateMenuItems, handleNotification]);

  return (
    <>
      {/* Render plugin overlays */}
      {overlays.map((overlay) => {
        const positionClass = {
          'top-left': 'top-4 left-4',
          'top-right': 'top-4 right-4',
          'bottom-left': 'bottom-4 left-4',
          'bottom-right': 'bottom-4 right-4',
          center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
        }[overlay.position];

        return (
          <div
            key={`${overlay.id}-${updateCounter}`}
            className={`fixed ${positionClass}`}
            style={{ zIndex: overlay.zIndex ?? 1000 }}
          >
            {overlay.render()}
          </div>
        );
      })}

      {/* Render plugin menu items */}
      {menuItems.length > 0 && (
        <div className="fixed bottom-4 left-4 z-50">
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-lg p-2 space-y-1">
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 px-2">
              Plugins
            </div>
            {menuItems.map((item) => (
              <button
                key={item.id}
                className="w-full text-left px-3 py-1 text-sm rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors flex items-center gap-2"
                onClick={item.onClick}
              >
                {item.icon && <span>{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Render plugin notifications */}
      {notifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
          {notifications.map((notification) => (
            <PluginNotificationItem
              key={notification.id}
              notification={notification}
              onDismiss={() =>
                notification.id &&
                setNotifications((prev) => prev.filter((n) => n.id !== notification.id))
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Individual notification item
 */
function PluginNotificationItem({
  notification,
  onDismiss,
}: {
  notification: PluginNotification;
  onDismiss: () => void;
}) {
  const colors = {
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100',
    success:
      'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-900 dark:text-green-100',
    warning:
      'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-900 dark:text-yellow-100',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100',
  };

  const icons = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  };

  return (
    <div
      className={`${colors[notification.type]} border rounded-lg shadow-lg p-3 flex items-start gap-2`}
    >
      <span className="text-lg">{icons[notification.type]}</span>
      <div className="flex-1">
        <p className="text-sm font-medium">{notification.message}</p>
      </div>
      <button
        onClick={onDismiss}
        className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
      >
        ×
      </button>
    </div>
  );
}

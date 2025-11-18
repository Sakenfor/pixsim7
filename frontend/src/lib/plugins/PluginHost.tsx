/**
 * Plugin Host Provider
 *
 * Provides plugin infrastructure at app root:
 * - Syncs game state with PluginManager
 * - Renders plugin overlays
 * - Handles plugin menu items and notifications
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { pluginManager } from './PluginManager';
import type { PluginGameState, PluginOverlay, PluginMenuItem, PluginNotification } from './types';

/**
 * Context for plugins to interact with the host
 */
interface PluginHostContext {
  showNotification: (notification: PluginNotification) => void;
}

const PluginHostContext = createContext<PluginHostContext | null>(null);

export const usePluginHost = () => {
  const context = useContext(PluginHostContext);
  if (!context) {
    throw new Error('usePluginHost must be used within PluginHostProvider');
  }
  return context;
};

/**
 * Props for PluginHostProvider
 */
interface PluginHostProviderProps {
  children: React.ReactNode;
  gameState: PluginGameState | null;
}

/**
 * Plugin Host Provider Component
 *
 * Wraps the app and provides plugin functionality
 */
export function PluginHostProvider({ children, gameState }: PluginHostProviderProps) {
  const [overlays, setOverlays] = useState<PluginOverlay[]>([]);
  const [menuItems, setMenuItems] = useState<PluginMenuItem[]>([]);
  const [notifications, setNotifications] = useState<PluginNotification[]>([]);

  // Update overlays when plugins change
  const updateOverlays = useCallback(() => {
    setOverlays(pluginManager.getOverlays());
  }, []);

  // Update menu items when plugins change
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

  // Setup plugin manager callbacks
  useEffect(() => {
    pluginManager.setUICallbacks({
      onOverlaysChange: updateOverlays,
      onMenuItemsChange: updateMenuItems,
      onNotification: handleNotification,
    });

    // Load persisted plugins
    pluginManager.loadPluginRegistry();

    // Initial update
    updateOverlays();
    updateMenuItems();
  }, [updateOverlays, updateMenuItems, handleNotification]);

  // Update game state in plugin manager
  useEffect(() => {
    if (gameState) {
      pluginManager.updateGameState(gameState);
    }
  }, [gameState]);

  const contextValue: PluginHostContext = {
    showNotification: handleNotification,
  };

  return (
    <PluginHostContext.Provider value={contextValue}>
      {children}

      {/* Render plugin overlays */}
      {overlays.map((overlay) => (
        <PluginOverlayContainer key={overlay.id} overlay={overlay} />
      ))}

      {/* Render plugin notifications */}
      <PluginNotifications
        notifications={notifications}
        onDismiss={(id) => setNotifications((prev) => prev.filter((n) => n.id !== id))}
      />

      {/* Render plugin menu items (placeholder - could be in a menu bar) */}
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
    </PluginHostContext.Provider>
  );
}

/**
 * Container for plugin overlay
 */
function PluginOverlayContainer({ overlay }: { overlay: PluginOverlay }) {
  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  };

  const className = `fixed ${positionClasses[overlay.position]} z-40`;
  const style = overlay.zIndex ? { zIndex: overlay.zIndex } : undefined;

  return (
    <div className={className} style={style}>
      {overlay.render()}
    </div>
  );
}

/**
 * Plugin notifications component
 */
interface PluginNotificationsProps {
  notifications: PluginNotification[];
  onDismiss: (id: string) => void;
}

function PluginNotifications({ notifications, onDismiss }: PluginNotificationsProps) {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((notification) => (
        <PluginNotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={() => notification.id && onDismiss(notification.id)}
        />
      ))}
    </div>
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
      className={`${colors[notification.type]} border rounded-lg shadow-lg p-3 flex items-start gap-2 animate-slide-in`}
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

/**
 * Hook to build PluginGameState from app state
 */
export function usePluginGameState(
  session: any | null,
  world: any | null,
  location: any | null,
  locationNpcs: any[]
): PluginGameState {
  return {
    // Session
    session: session,
    flags: session?.flags || {},
    relationships: session?.relationships || {},

    // World
    world: world,
    worldTime: world
      ? {
          day: Math.floor(world.world_time / 86400) + 1,
          hour: Math.floor((world.world_time % 86400) / 3600),
        }
      : { day: 1, hour: 8 },

    // Location
    currentLocation: location,
    locationNpcs: locationNpcs || [],
  };
}

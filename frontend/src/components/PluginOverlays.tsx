/**
 * Plugin Overlays Renderer
 *
 * Renders all active plugin overlays on the game screen.
 * Integrate this into Game2D or main game component.
 */

import { useState, useEffect } from 'react';
import { pluginManager } from '../lib/plugins/PluginManager';
import type { PluginOverlay } from '../lib/plugins/types';
import { useToast } from '../stores/toastStore';

export function PluginOverlays() {
  const [overlays, setOverlays] = useState<PluginOverlay[]>([]);
  const toast = useToast();

  useEffect(() => {
    // Setup callbacks
    pluginManager.setUICallbacks({
      onOverlaysChange: () => setOverlays(pluginManager.getOverlays()),
      onNotification: (notification) => {
        const type = notification.type || 'info';
        toast[type](notification.message, notification.duration);
      },
    });

    // Load initial overlays
    setOverlays(pluginManager.getOverlays());
  }, []);

  if (overlays.length === 0) {
    return null;
  }

  return (
    <>
      {overlays.map(overlay => {
        const positionClass = {
          'top-left': 'top-4 left-4',
          'top-right': 'top-4 right-4',
          'bottom-left': 'bottom-4 left-4',
          'bottom-right': 'bottom-4 right-4',
          'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
        }[overlay.position];

        return (
          <div
            key={overlay.id}
            className={`fixed ${positionClass}`}
            style={{ zIndex: overlay.zIndex ?? 1000 }}
          >
            {overlay.render()}
          </div>
        );
      })}
    </>
  );
}

/**
 * Plugin Overlays Renderer
 *
 * Renders all active plugin overlays on the game screen.
 * This component should be mounted at the App level to ensure overlays appear above all content.
 */

import { useState, useEffect } from 'react';
import { pluginManager } from '../lib/plugins';
import type { PluginOverlay } from '../lib/plugins/types';

export function PluginOverlays() {
  const [overlays, setOverlays] = useState<PluginOverlay[]>([]);
  const [updateCounter, setUpdateCounter] = useState(0);

  useEffect(() => {
    // Initial load
    setOverlays(pluginManager.getOverlays());

    // Force re-render when overlays change
    const handleOverlaysChange = () => {
      setOverlays(pluginManager.getOverlays());
      setUpdateCounter(c => c + 1);
    };

    // Register callback
    pluginManager.setUICallbacks({
      onOverlaysChange: handleOverlaysChange,
    });

    return () => {
      // Cleanup: unset our callback
      pluginManager.setUICallbacks({
        onOverlaysChange: undefined,
      });
    };
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
            key={`${overlay.id}-${updateCounter}`}
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

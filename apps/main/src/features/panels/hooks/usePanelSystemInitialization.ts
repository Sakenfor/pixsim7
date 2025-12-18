/**
 * Panel System Initialization Hook
 *
 * Hook to initialize the panel orchestration system at app startup.
 * Registers all panels with the panel manager and applies user settings.
 */

import { useEffect, useState } from 'react';
import { registerAllPanels } from '../lib/panelMetadataRegistry';

export interface PanelSystemInitializationOptions {
  /** Whether to apply user settings overrides (default: true) */
  applySettings?: boolean;
  /** Whether to automatically initialize on mount (default: true) */
  autoInitialize?: boolean;
}

export interface PanelSystemInitializationState {
  /** Whether the system has been initialized */
  initialized: boolean;
  /** Whether initialization is in progress */
  initializing: boolean;
  /** Error that occurred during initialization */
  error: Error | null;
  /** Manual initialization function */
  initialize: () => Promise<void>;
}

/**
 * Hook to initialize the panel system
 *
 * @example
 * ```tsx
 * function App() {
 *   const { initialized, error } = usePanelSystemInitialization();
 *
 *   if (error) return <div>Error: {error.message}</div>;
 *   if (!initialized) return <div>Loading...</div>;
 *
 *   return <YourApp />;
 * }
 * ```
 */
export function usePanelSystemInitialization(
  options: PanelSystemInitializationOptions = {}
): PanelSystemInitializationState {
  const { applySettings = true, autoInitialize = true } = options;

  const [initialized, setInitialized] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const initialize = async () => {
    if (initialized || initializing) return;

    setInitializing(true);
    setError(null);

    try {
      await registerAllPanels(applySettings);
      setInitialized(true);
      console.log('[usePanelSystemInitialization] Panel system initialized');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      console.error('[usePanelSystemInitialization] Failed to initialize panel system:', error);
    } finally {
      setInitializing(false);
    }
  };

  useEffect(() => {
    if (autoInitialize) {
      initialize();
    }
  }, [autoInitialize]);

  return {
    initialized,
    initializing,
    error,
    initialize,
  };
}

/**
 * Simple hook that just initializes panels without returning state
 * Useful when you don't need to track initialization state
 */
export function useInitializePanelSystem(applySettings = true) {
  useEffect(() => {
    registerAllPanels(applySettings).catch(err => {
      console.error('[useInitializePanelSystem] Failed to initialize:', err);
    });
  }, [applySettings]);
}

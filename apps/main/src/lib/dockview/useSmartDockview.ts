/**
 * useSmartDockview Hook
 *
 * Manages smart tab visibility and layout persistence for dockview.
 * - Auto-hides tabs when a group has only 1 panel
 * - Shows tabs when 2+ panels are grouped together
 * - Persists layout to localStorage
 */

import { useCallback, useEffect, useRef } from 'react';
import type { DockviewApi } from 'dockview-core';

export interface UseSmartDockviewOptions {
  /** Storage key for persisting layout (optional) */
  storageKey?: string;
  /** Minimum panels in a group to show tabs (default: 2) */
  minPanelsForTabs?: number;
  /** Callback when layout changes */
  onLayoutChange?: () => void;
  /**
   * List of deprecated panel IDs that should trigger layout reset.
   * If saved layout contains any of these panels, it will be cleared.
   * Useful when removing panels to prevent deserialization errors.
   */
  deprecatedPanels?: string[];
}

export interface UseSmartDockviewReturn {
  /** Call when dockview is ready */
  onReady: (api: DockviewApi) => void;
  /** Get the current API ref */
  getApi: () => DockviewApi | null;
  /** Reset layout to default */
  resetLayout: () => void;
  /** Save current layout */
  saveLayout: () => void;
  /** Load saved layout */
  loadLayout: () => boolean;
}

export function useSmartDockview(
  options: UseSmartDockviewOptions = {}
): UseSmartDockviewReturn {
  const { storageKey, minPanelsForTabs = 2, onLayoutChange, deprecatedPanels = [] } = options;
  const apiRef = useRef<DockviewApi | null>(null);
  const disposablesRef = useRef<Array<{ dispose: () => void }>>([]);

  /**
   * Update tab visibility for all groups
   * Hides tabs when group has fewer than minPanelsForTabs panels
   */
  const updateTabVisibility = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;

    api.groups.forEach((group) => {
      const model = (group as any).model;
      const modelSize =
        typeof model?.size === 'number'
          ? model.size
          : undefined;
      const panelCount =
        typeof modelSize === 'number'
          ? modelSize
          : Array.isArray((group as any).panels)
            ? (group as any).panels.length
            : typeof (group as any).panels?.length === 'number'
              ? (group as any).panels.length
              : 0;
      const shouldShowTabs = panelCount >= minPanelsForTabs;

      // Access the header through the group's model
      // Note: This accesses internal dockview structure
      try {
        const header = (group as any).header ?? model?.header;
        if (header && typeof header.hidden !== 'undefined') {
          header.hidden = !shouldShowTabs;
        }
      } catch (e) {
        // Fallback: try through model
        try {
          if (model?.header) {
            model.header.hidden = !shouldShowTabs;
          }
        } catch {
          // Silently fail if structure doesn't match
        }
      }

      // CSS fallback for cases where header hiding doesn't apply
      const groupElement = (group as any).element;
      if (groupElement && groupElement.classList) {
        groupElement.classList.toggle('dv-tabs-hidden', !shouldShowTabs);
      }
    });
  }, [minPanelsForTabs]);

  /**
   * Save current layout to localStorage
   */
  const saveLayout = useCallback(() => {
    if (!storageKey || !apiRef.current) return;

    try {
      const layout = apiRef.current.toJSON();

      // Use a replacer to exclude circular references (like dockviewApi in context)
      const replacer = (key: string, value: any) => {
        // Skip dockviewApi to avoid circular references
        if (key === 'dockviewApi') return undefined;
        return value;
      };

      localStorage.setItem(storageKey, JSON.stringify(layout, replacer));
    } catch (error) {
      console.error('[SmartDockview] Failed to save layout:', error);
    }
  }, [storageKey]);

  /**
   * Load saved layout from localStorage
   * @returns true if layout was loaded successfully
   */
  const loadLayout = useCallback((): boolean => {
    if (!storageKey || !apiRef.current) return false;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        // Check for deprecated panels before loading
        if (deprecatedPanels.length > 0) {
          const hasDeprecatedPanel = deprecatedPanels.some(panelId =>
            saved.includes(`"${panelId}"`)
          );

          if (hasDeprecatedPanel) {
            console.log(
              `[SmartDockview] Layout contains deprecated panels [${deprecatedPanels.join(', ')}]. Clearing layout.`
            );
            localStorage.removeItem(storageKey);
            return false;
          }
        }

        const layout = JSON.parse(saved);
        apiRef.current.fromJSON(layout);
        return true;
      }
    } catch (error) {
      console.error('[SmartDockview] Failed to load layout:', error);
    }
    return false;
  }, [storageKey, deprecatedPanels]);

  /**
   * Reset layout by clearing saved state
   */
  const resetLayout = useCallback(() => {
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  /**
   * Initialize dockview with smart features
   */
  const onReady = useCallback(
    (api: DockviewApi) => {
      apiRef.current = api;

      // Clean up any previous disposables
      disposablesRef.current.forEach((d) => d.dispose());
      disposablesRef.current = [];

      // Subscribe to layout changes for tab visibility updates
      const layoutDisposable = api.onDidLayoutChange(() => {
        updateTabVisibility();
        saveLayout();
        onLayoutChange?.();
      });
      disposablesRef.current.push(layoutDisposable);

      // Subscribe to panel add/remove for immediate tab visibility updates
      const addDisposable = api.onDidAddPanel(() => {
        // Use requestAnimationFrame to ensure DOM is updated
        requestAnimationFrame(updateTabVisibility);
      });
      disposablesRef.current.push(addDisposable);

      const removeDisposable = api.onDidRemovePanel(() => {
        requestAnimationFrame(updateTabVisibility);
      });
      disposablesRef.current.push(removeDisposable);

      const layoutFromJsonDisposable = api.onDidLayoutFromJSON(() => {
        requestAnimationFrame(updateTabVisibility);
      });
      disposablesRef.current.push(layoutFromJsonDisposable);

      // Initial tab visibility update
      requestAnimationFrame(updateTabVisibility);
    },
    [updateTabVisibility, saveLayout, onLayoutChange]
  );

  /**
   * Get the current API
   */
  const getApi = useCallback(() => apiRef.current, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disposablesRef.current.forEach((d) => d.dispose());
      disposablesRef.current = [];
    };
  }, []);

  return {
    onReady,
    getApi,
    resetLayout,
    saveLayout,
    loadLayout,
  };
}

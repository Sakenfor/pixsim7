/**
 * useSmartDockview Hook
 *
 * Manages smart tab visibility and layout persistence for dockview.
 * - Auto-hides tabs when a group has only 1 panel
 * - Shows tabs when 2+ panels are grouped together
 * - Persists layout to localStorage
 */

import { useCallback, useEffect, useRef } from "react";
import type { DockviewApi } from "dockview-core";
import { getGroups as getDockviewGroups } from "@pixsim7/shared.dockview.core";
import { isTabPinned, subscribeTabPins } from "./tabPinState";
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
  options: UseSmartDockviewOptions = {},
): UseSmartDockviewReturn {
  const { storageKey, minPanelsForTabs = 2, onLayoutChange, deprecatedPanels = [] } = options;
  const apiRef = useRef<DockviewApi | null>(null);
  const disposablesRef = useRef<Array<{ dispose: () => void }>>([]);

  // Use refs to avoid callbacks changing when parent recreates props
  const deprecatedPanelsRef = useRef(deprecatedPanels);
  deprecatedPanelsRef.current = deprecatedPanels;
  const onLayoutChangeRef = useRef(onLayoutChange);
  onLayoutChangeRef.current = onLayoutChange;

  /**
   * Update tab visibility for all groups
   * Hides tabs when group has fewer than minPanelsForTabs panels
   */
  const updateTabVisibility = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;

    const getGroupPanels = (group: any): any[] => {
      if (Array.isArray(group?.panels)) return group.panels;
      if (group?.panels && typeof group.panels.values === "function") {
        return Array.from(group.panels.values());
      }
      const model = group?.model;
      if (model && typeof model.values === "function") {
        return Array.from(model.values());
      }
      return [];
    };

    const clearCompactState = (groupElement: HTMLElement | null) => {
      if (!groupElement) return;
      groupElement.classList.remove("dv-tabs-compact");
      groupElement.classList.remove("dv-tabs-compact-has-hidden");

      const header = groupElement.querySelector(".dv-tabs-and-actions-container") as HTMLElement | null;
      if (header) {
        delete (header as any).dataset.compactHiddenCount;
      }

      const tabElements = groupElement.querySelectorAll(".dv-tabs-container .dv-default-tab");
      tabElements.forEach((tabElement) => {
        tabElement.classList.remove("dv-tab-compact-visible");
        tabElement.classList.remove("dv-tab-pinned");
      });
    };

    getDockviewGroups(api).forEach((group) => {
      const groupPanels = getGroupPanels(group);
      const model = (group as any).model;
      const modelSize = typeof model?.size === "number" ? model.size : undefined;
      const panelCount =
        groupPanels.length > 0
          ? groupPanels.length
          : typeof modelSize === "number"
            ? modelSize
            : Array.isArray((group as any).panels)
              ? (group as any).panels.length
              : typeof (group as any).panels?.length === "number"
                ? (group as any).panels.length
                : 0;
      const shouldShowTabs = panelCount >= minPanelsForTabs;

      // Toggle CSS class on the group element to hide/show tabs.
      // We do NOT set header.hidden because that hides the entire header
      // including left/right action components (like drag handles).
      // Instead, the CSS class targets only the tabs container.
      const groupElement = (group as any).element;
      if (groupElement && groupElement.classList) {
        groupElement.classList.toggle("dv-tabs-hidden", !shouldShowTabs);
      }

      if (!groupElement) return;
      if (!shouldShowTabs || panelCount <= 1) {
        clearCompactState(groupElement);
        return;
      }

      groupElement.classList.add("dv-tabs-compact");

      const header = groupElement.querySelector(".dv-tabs-and-actions-container") as HTMLElement | null;
      const tabElements = Array.from(
        groupElement.querySelectorAll<HTMLElement>(".dv-tabs-container .dv-default-tab"),
      );

      const activePanelId =
        typeof (group as any)?.activePanel?.id === "string"
          ? (group as any).activePanel.id
          : typeof model?.activePanel?.id === "string"
            ? model.activePanel.id
            : null;

      let visibleCount = 0;
      for (let i = 0; i < tabElements.length; i += 1) {
        const tabEl = tabElements[i];
        const panelId = typeof groupPanels[i]?.id === "string" ? groupPanels[i].id : null;
        const pinned = panelId ? isTabPinned(panelId) : false;
        const isActive = panelId ? panelId === activePanelId : i === 0;
        const shouldStayVisible = isActive || pinned;
        if (shouldStayVisible) visibleCount += 1;
        tabEl.classList.toggle("dv-tab-compact-visible", shouldStayVisible);
        tabEl.classList.toggle("dv-tab-pinned", pinned);
      }

      // Guard against transient states where active panel isn't resolved yet.
      if (visibleCount === 0 && tabElements.length > 0) {
        tabElements[0].classList.add("dv-tab-compact-visible");
        visibleCount = 1;
      }

      const hiddenCount = Math.max(0, panelCount - visibleCount);
      groupElement.classList.toggle("dv-tabs-compact-has-hidden", hiddenCount > 0);
      if (header) {
        if (hiddenCount > 0) {
          header.dataset.compactHiddenCount = String(hiddenCount);
        } else {
          delete header.dataset.compactHiddenCount;
        }
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
        if (key === "dockviewApi") return undefined;
        return value;
      };

      localStorage.setItem(storageKey, JSON.stringify(layout, replacer));
    } catch (error) {
      console.error("[SmartDockview] Failed to save layout:", error);
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
        // Check for deprecated panels before loading (use ref to avoid dependency)
        const currentDeprecatedPanels = deprecatedPanelsRef.current;
        if (currentDeprecatedPanels.length > 0) {
          const hasDeprecatedPanel = currentDeprecatedPanels.some((panelId) =>
            saved.includes(`"${panelId}"`)
          );

          if (hasDeprecatedPanel) {
            console.log(
              `[SmartDockview] Layout contains deprecated panels [${currentDeprecatedPanels.join(", ")}]. Clearing layout.`,
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
      console.error("[SmartDockview] Failed to load layout:", error);
    }
    return false;
  }, [storageKey]);

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
        onLayoutChangeRef.current?.();
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

      const activePanelChange = (api as any).onDidActivePanelChange;
      if (typeof activePanelChange === "function") {
        const activePanelDisposable = activePanelChange.call(api, () => {
          requestAnimationFrame(updateTabVisibility);
        });
        if (activePanelDisposable && typeof activePanelDisposable.dispose === "function") {
          disposablesRef.current.push(activePanelDisposable);
        }
      }

      const unsubscribePinnedTabs = subscribeTabPins(() => {
        requestAnimationFrame(updateTabVisibility);
      });
      disposablesRef.current.push({ dispose: unsubscribePinnedTabs });

      // Initial tab visibility update
      requestAnimationFrame(updateTabVisibility);
    },
    [updateTabVisibility, saveLayout],
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

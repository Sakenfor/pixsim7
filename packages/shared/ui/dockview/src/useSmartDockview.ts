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
  /**
   * Optional provider for currently-registered dockview component IDs.
   * When provided, saved layouts referencing missing component IDs are
   * discarded before attempting fromJSON().
   */
  getAvailableComponentIds?: () => readonly string[];
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

interface LayoutInspection {
  hasInvalidComponentEntry: boolean;
  hasMissingPanelComponent: boolean;
}

export interface LayoutComponentAvailability {
  hasInvalidComponentEntry: boolean;
  hasMissingPanelComponent: boolean;
  layoutComponentIds: string[];
  missingComponentIds: string[];
  availableComponentCount: number | null;
}

function removeStoredLayout(storageKey?: string): void {
  if (!storageKey) {
    return;
  }

  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage failures; caller will fall back to default layout.
  }
}

function addComponentId(entry: unknown, out: Set<string>): boolean {
  if (typeof entry !== "string") {
    return false;
  }
  const id = entry.trim();
  if (id.length === 0) {
    return false;
  }
  out.add(id);
  return true;
}

function isPanelLikeRecord(record: Record<string, unknown>): boolean {
  if (typeof record.id !== "string" || record.id.trim().length === 0) {
    return false;
  }
  return (
    "title" in record ||
    "params" in record ||
    "renderer" in record ||
    "minimumWidth" in record ||
    "minimumHeight" in record ||
    "maximumWidth" in record ||
    "maximumHeight" in record ||
    "tabComponent" in record ||
    "contentComponent" in record ||
    "view" in record
  );
}

function inspectLayoutComponents(value: unknown, out: Set<string>, depth = 0): LayoutInspection {
  if (value == null || depth > 48) {
    return { hasInvalidComponentEntry: false, hasMissingPanelComponent: false };
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = inspectLayoutComponents(entry, out, depth + 1);
      if (nested.hasInvalidComponentEntry || nested.hasMissingPanelComponent) {
        return nested;
      }
    }
    return { hasInvalidComponentEntry: false, hasMissingPanelComponent: false };
  }

  if (typeof value !== "object") {
    return { hasInvalidComponentEntry: false, hasMissingPanelComponent: false };
  }

  const record = value as Record<string, unknown>;
  let hasPanelComponent = false;

  if ("component" in record) {
    hasPanelComponent = true;
    if (!addComponentId(record.component, out)) {
      return { hasInvalidComponentEntry: true, hasMissingPanelComponent: false };
    }
  }

  if ("contentComponent" in record) {
    hasPanelComponent = true;
    if (!addComponentId(record.contentComponent, out)) {
      return { hasInvalidComponentEntry: true, hasMissingPanelComponent: false };
    }
  }

  if ("view" in record) {
    const viewValue = record.view;
    if (viewValue != null && typeof viewValue !== "object") {
      return { hasInvalidComponentEntry: true, hasMissingPanelComponent: false };
    }
    if (viewValue && typeof viewValue === "object") {
      const viewRecord = viewValue as Record<string, unknown>;

      if ("contentComponent" in viewRecord) {
        hasPanelComponent = true;
        if (!addComponentId(viewRecord.contentComponent, out)) {
          return { hasInvalidComponentEntry: true, hasMissingPanelComponent: false };
        }
      }

      if ("content" in viewRecord) {
        hasPanelComponent = true;
        const contentValue = viewRecord.content;
        if (typeof contentValue === "string") {
          if (!addComponentId(contentValue, out)) {
            return { hasInvalidComponentEntry: true, hasMissingPanelComponent: false };
          }
        } else if (contentValue && typeof contentValue === "object") {
          const contentRecord = contentValue as Record<string, unknown>;
          if (!("id" in contentRecord) || !addComponentId(contentRecord.id, out)) {
            return { hasInvalidComponentEntry: true, hasMissingPanelComponent: false };
          }
        } else {
          return { hasInvalidComponentEntry: true, hasMissingPanelComponent: false };
        }
      }
    }
  }

  if (isPanelLikeRecord(record) && !hasPanelComponent) {
    return { hasInvalidComponentEntry: false, hasMissingPanelComponent: true };
  }

  for (const entry of Object.values(record)) {
    const nested = inspectLayoutComponents(entry, out, depth + 1);
    if (nested.hasInvalidComponentEntry || nested.hasMissingPanelComponent) {
      return nested;
    }
  }

  return { hasInvalidComponentEntry: false, hasMissingPanelComponent: false };
}

export function analyzeLayoutComponentAvailability(
  layout: unknown,
  availableComponentIds?: readonly string[],
): LayoutComponentAvailability {
  const layoutComponentIdSet = new Set<string>();
  const inspection = inspectLayoutComponents(layout, layoutComponentIdSet);
  const layoutComponentIds = Array.from(layoutComponentIdSet);

  if (!availableComponentIds) {
    return {
      hasInvalidComponentEntry: inspection.hasInvalidComponentEntry,
      hasMissingPanelComponent: inspection.hasMissingPanelComponent,
      layoutComponentIds,
      missingComponentIds: [],
      availableComponentCount: null,
    };
  }

  const availableIds = new Set(
    availableComponentIds
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );

  if (layoutComponentIds.length > 0 && availableIds.size === 0) {
    return {
      hasInvalidComponentEntry: inspection.hasInvalidComponentEntry,
      hasMissingPanelComponent: inspection.hasMissingPanelComponent,
      layoutComponentIds,
      missingComponentIds: [],
      availableComponentCount: 0,
    };
  }

  const missingComponentIds =
    availableIds.size > 0
      ? layoutComponentIds.filter((componentId) => !availableIds.has(componentId))
      : [];

  return {
    hasInvalidComponentEntry: inspection.hasInvalidComponentEntry,
    hasMissingPanelComponent: inspection.hasMissingPanelComponent,
    layoutComponentIds,
    missingComponentIds,
    availableComponentCount: availableIds.size,
  };
}

export function useSmartDockview(
  options: UseSmartDockviewOptions = {},
): UseSmartDockviewReturn {
  const {
    storageKey,
    minPanelsForTabs = 2,
    onLayoutChange,
    deprecatedPanels = [],
    getAvailableComponentIds,
  } = options;
  const apiRef = useRef<DockviewApi | null>(null);
  const disposablesRef = useRef<Array<{ dispose: () => void }>>([]);

  // Use refs to avoid callbacks changing when parent recreates props
  const deprecatedPanelsRef = useRef(deprecatedPanels);
  deprecatedPanelsRef.current = deprecatedPanels;
  const onLayoutChangeRef = useRef(onLayoutChange);
  onLayoutChangeRef.current = onLayoutChange;
  // Track current storageKey via ref so save/load/reset always target the
  // latest key. The onReady-installed onDidLayoutChange listener captures
  // saveLayout once; without this ref it would write to whatever key was
  // active at first ready forever.
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;

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
        delete header.dataset.compactHiddenCount;
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
      const groupElement =
        (group as any).element instanceof HTMLElement
          ? ((group as any).element as HTMLElement)
          : null;
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
        groupElement.querySelectorAll(".dv-tabs-container .dv-default-tab"),
      ) as HTMLElement[];

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
    const currentKey = storageKeyRef.current;
    if (!currentKey || !apiRef.current) return;

    try {
      const layout = apiRef.current.toJSON();

      // Use a replacer to exclude circular references (like dockviewApi in context)
      const replacer = (key: string, value: any) => {
        // Skip dockviewApi to avoid circular references
        if (key === "dockviewApi") return undefined;
        return value;
      };

      localStorage.setItem(currentKey, JSON.stringify(layout, replacer));
    } catch (error) {
      console.error("[SmartDockview] Failed to save layout:", error);
    }
  }, []);

  /**
   * Load saved layout from localStorage
   * @returns true if layout was loaded successfully
   */
  const loadLayout = useCallback((): boolean => {
    const currentKey = storageKeyRef.current;
    if (!currentKey || !apiRef.current) return false;

    try {
      const saved = localStorage.getItem(currentKey);
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
            localStorage.removeItem(currentKey);
            return false;
          }
        }

        const layout = JSON.parse(saved);
        const availability = analyzeLayoutComponentAvailability(
          layout,
          getAvailableComponentIds?.(),
        );
        if (
          availability.hasInvalidComponentEntry ||
          availability.hasMissingPanelComponent
        ) {
          console.warn(
            "[SmartDockview] Layout contains invalid or missing panel components. Clearing layout.",
          );
          localStorage.removeItem(currentKey);
          return false;
        }
        if (getAvailableComponentIds) {
          if (
            availability.layoutComponentIds.length > 0 &&
            availability.availableComponentCount === 0
          ) {
            console.warn(
              "[SmartDockview] Layout restore skipped because components are not registered yet.",
            );
            return false;
          }
          if (availability.missingComponentIds.length > 0) {
            console.warn(
              `[SmartDockview] Layout references unavailable components [${availability.missingComponentIds.join(", ")}]. ` +
              "Skipping restore until components register.",
            );
            return false;
          }
        }
        apiRef.current.fromJSON(layout);
        return true;
      }
    } catch (error) {
      console.error("[SmartDockview] Failed to load layout:", error);
      // Self-heal invalid/corrupted layouts (e.g. stale panel IDs or
      // unsupported component payloads). Keeping a broken snapshot causes
      // the same deserialize error to repeat on every mount.
      removeStoredLayout(currentKey);
    }
    return false;
  }, [getAvailableComponentIds]);

  /**
   * Reset layout by clearing saved state
   */
  const resetLayout = useCallback(() => {
    const currentKey = storageKeyRef.current;
    if (currentKey) {
      localStorage.removeItem(currentKey);
    }
  }, []);

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

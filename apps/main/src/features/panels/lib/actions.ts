// React import for the hook
import type { CubeFace } from "@pixsim7/pixcubes";
import type { ActionDefinition } from "@pixsim7/shared.types";
import React from "react";

/**
 * Panel Action Registry
 *
 * Allows panels to dynamically register their available actions,
 * which cube widgets can then expose on their faces when docked.
 */


import { capabilityRegistry, type ActionCapability } from "@lib/capabilities";

import { toPanelActions, type ToPanelActionOptions } from "./actionAdapters";

export interface PanelActionError {
  actionId: string;
  panelId: string;
  error: Error;
  timestamp: number;
}

export interface PanelAction {
  id: string;
  label: string;
  icon: string;
  description?: string;
  face?: CubeFace; // Preferred face placement
  shortcut?: string;
  execute: () => void | Promise<void>;
  enabled?: () => boolean; // Dynamic enable/disable
  onError?: (error: Error) => void; // Custom error handler
}

export interface PanelActionsConfig {
  panelId: string;
  panelName: string;
  actions: PanelAction[];
  defaultFaces?: Partial<Record<CubeFace, string>>; // Map face to action ID
  /** Optional actions derived from capability registry by ID */
  capabilityActionIds?: string[];
  /** Panel-specific options for capability-derived actions */
  capabilityActionOptions?: Record<string, ToPanelActionOptions>;
}

class PanelActionRegistry {
  private registrations = new Map<string, PanelActionsConfig>();
  private listeners = new Set<() => void>();
  private errorListeners = new Set<(error: PanelActionError) => void>();
  private lastErrors: PanelActionError[] = [];

  constructor() {
    // Recompute panel actions when capability registry updates.
    capabilityRegistry.subscribe(() => {
      this.notifyListeners();
    });
  }

  private resolveActions(config: PanelActionsConfig): PanelAction[] {
    const baseActions = config.actions ?? [];
    const ids = config.capabilityActionIds ?? [];
    if (ids.length === 0) {
      return baseActions;
    }

    const existingIds = new Set(baseActions.map(action => action.id));
    const derived: PanelAction[] = [];

    for (const id of ids) {
      if (existingIds.has(id)) continue;
      const action = capabilityRegistry.getAction(id);
      if (!action) continue;
      const options = config.capabilityActionOptions?.[id];
      derived.push(toPanelActionFromCapability(action, options));
    }

    return [...baseActions, ...derived];
  }

  /**
   * Register a panel's available actions
   */
  register(config: PanelActionsConfig) {
    this.registrations.set(config.panelId, config);
    this.notifyListeners();
  }

  /**
   * Unregister a panel
   */
  unregister(panelId: string) {
    this.registrations.delete(panelId);
    this.notifyListeners();
  }

  /**
   * Update existing panel actions
   */
  update(panelId: string, updates: Partial<PanelActionsConfig>) {
    const existing = this.registrations.get(panelId);
    if (existing) {
      this.registrations.set(panelId, { ...existing, ...updates });
      this.notifyListeners();
    }
  }

  /**
   * Get actions for a specific panel
   */
  getActions(panelId: string): PanelAction[] {
    const config = this.registrations.get(panelId);
    if (!config) return [];
    return this.resolveActions(config);
  }

  /**
   * Get full config for a panel
   */
  getConfig(panelId: string): PanelActionsConfig | undefined {
    return this.registrations.get(panelId);
  }

  /**
   * Get all registered panels
   */
  getAllPanels(): string[] {
    return Array.from(this.registrations.keys());
  }

  /**
   * Get action by ID for a specific panel
   */
  getAction(panelId: string, actionId: string): PanelAction | undefined {
    return this.getActions(panelId).find((action) => action.id === actionId);
  }

  /**
   * Execute an action with proper error handling
   */
  async executeAction(panelId: string, actionId: string): Promise<boolean> {
    const action = this.getAction(panelId, actionId);

    if (!action) {
      const error = new Error(
        `Action '${actionId}' not found in panel '${panelId}'`,
      );
      this.handleError(panelId, actionId, error);
      return false;
    }

    // Check if action is enabled
    if (action.enabled && !action.enabled()) {
      const error = new Error(`Action '${actionId}' is currently disabled`);
      this.handleError(panelId, actionId, error);
      return false;
    }

    try {
      await action.execute();
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleError(panelId, actionId, err);

      // Call custom error handler if provided
      if (action.onError) {
        try {
          action.onError(err);
        } catch (handlerError) {
          console.error("Error in custom error handler:", handlerError);
        }
      }

      return false;
    }
  }

  /**
   * Handle action errors
   */
  private handleError(panelId: string, actionId: string, error: Error) {
    const actionError: PanelActionError = {
      panelId,
      actionId,
      error,
      timestamp: Date.now(),
    };

    // Store error
    this.lastErrors.push(actionError);
    if (this.lastErrors.length > 10) {
      this.lastErrors.shift(); // Keep only last 10 errors
    }

    // Log to console
    console.error(
      `[Panel Action Error] ${panelId}.${actionId}:`,
      error.message,
    );

    // Notify error listeners
    this.errorListeners.forEach((listener) => {
      try {
        listener(actionError);
      } catch (err) {
        console.error("Error in error listener:", err);
      }
    });
  }

  /**
   * Subscribe to action errors
   */
  onError(listener: (error: PanelActionError) => void): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit = 10): PanelActionError[] {
    return this.lastErrors.slice(-limit);
  }

  /**
   * Clear error history
   */
  clearErrors() {
    this.lastErrors = [];
  }

  /**
   * Get face mappings for a panel (which action goes on which face)
   */
  getFaceMappings(panelId: string): Record<CubeFace, PanelAction | null> {
    const config = this.registrations.get(panelId);
    if (!config) {
      return {
        front: null,
        back: null,
        left: null,
        right: null,
        top: null,
        bottom: null,
      };
    }

    const actions = this.resolveActions(config);
    const mappings: Record<CubeFace, PanelAction | null> = {
      front: null,
      back: null,
      left: null,
      right: null,
      top: null,
      bottom: null,
    };

    // Apply default face mappings from config
    if (config.defaultFaces) {
      Object.entries(config.defaultFaces).forEach(([face, actionId]) => {
        const action = actions.find((a) => a.id === actionId);
        if (action) {
          mappings[face as CubeFace] = action;
        }
      });
    }

    // Apply preferred face from individual actions (overrides defaults)
    actions.forEach((action) => {
      if (action.face && !mappings[action.face]) {
        mappings[action.face] = action;
      }
    });

    // Auto-assign remaining actions to empty faces
    const emptyFaces = (Object.keys(mappings) as CubeFace[]).filter(
      (face) => !mappings[face],
    );
    const unassignedActions = actions.filter(
      (action) => !Object.values(mappings).includes(action),
    );

    unassignedActions.forEach((action, index) => {
      if (emptyFaces[index]) {
        mappings[emptyFaces[index]] = action;
      }
    });

    return mappings;
  }

  /**
   * Subscribe to registry changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Clear all registrations (useful for testing)
   */
  clear() {
    this.registrations.clear();
    this.notifyListeners();
  }

  /**
   * Register panel actions from canonical ActionDefinition format.
   *
   * This allows module-defined actions to be used in panel registries
   * using the shared ActionDefinition type. The adapter converts them
   * to PanelAction format automatically.
   *
   * @param config - Panel configuration with actions as ActionDefinition[]
   * @param defaultOptions - Options applied to all converted actions
   *
   * @example
   * ```typescript
   * panelActionRegistry.registerFromDefinitions({
   *   panelId: 'my-panel',
   *   panelName: 'My Panel',
   *   actions: [refreshAction, saveAction],
   * }, { face: 'top' });
   * ```
   */
  registerFromDefinitions(
    config: Omit<PanelActionsConfig, 'actions'> & { actions: ActionDefinition[] },
    defaultOptions?: ToPanelActionOptions
  ): void {
    const panelActions = toPanelActions(config.actions, defaultOptions);
    this.register({
      ...config,
      actions: panelActions,
    });
  }

  /**
   * Register panel actions sourced from capability action IDs.
   *
   * @param config - Panel configuration with action IDs from capability registry
   *
   * @example
   * ```typescript
   * panelActionRegistry.registerFromCapabilities({
   *   panelId: 'my-panel',
   *   panelName: 'My Panel',
   *   actionIds: ['workspace.open', 'workspace.save'],
   *   actionOptions: {
   *     'workspace.save': { face: 'top' },
   *   },
   * });
   * ```
   */
  registerFromCapabilities(
    config: Omit<PanelActionsConfig, 'actions' | 'capabilityActionIds' | 'capabilityActionOptions'> & {
      actionIds: string[];
      actionOptions?: Record<string, ToPanelActionOptions>;
      actions?: PanelAction[];
    }
  ): void {
    this.register({
      ...config,
      actions: config.actions ?? [],
      capabilityActionIds: config.actionIds,
      capabilityActionOptions: config.actionOptions,
    });
  }
}

// Singleton instance
export const panelActionRegistry = new PanelActionRegistry();

function toPanelActionFromCapability(
  action: ActionCapability,
  options?: ToPanelActionOptions
): PanelAction {
  return {
    id: action.id,
    label: action.name,
    icon: action.icon ?? "circle",
    description: action.description,
    shortcut: action.shortcut,
    face: options?.face,
    enabled: action.enabled,
    onError: options?.onError,
    execute: () => {
      return action.execute({ source: "programmatic" });
    },
  };
}

/**
 * React hook for using panel actions in components
 */
export function usePanelActions(panelId: string) {
  const [actions, setActions] = React.useState<PanelAction[]>([]);
  const [config, setConfig] = React.useState<PanelActionsConfig | undefined>();

  React.useEffect(() => {
    const updateActions = () => {
      setActions(panelActionRegistry.getActions(panelId));
      setConfig(panelActionRegistry.getConfig(panelId));
    };

    updateActions();
    return panelActionRegistry.subscribe(updateActions);
  }, [panelId]);

  const executeAction = React.useCallback(
    (actionId: string) => {
      return panelActionRegistry.executeAction(panelId, actionId);
    },
    [panelId],
  );

  return {
    actions,
    config,
    executeAction,
    faceMappings: config ? panelActionRegistry.getFaceMappings(panelId) : null,
  };
}

// Re-export singleton
export { panelActionRegistry as default };

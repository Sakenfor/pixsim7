// React import for the hook
import React from 'react';

/**
 * Panel Action Registry
 *
 * Allows panels to dynamically register their available actions,
 * which cube widgets can then expose on their faces when docked.
 */

import { CubeFace } from '../stores/controlCubeStore';

export interface PanelAction {
  id: string;
  label: string;
  icon: string;
  description?: string;
  face?: CubeFace; // Preferred face placement
  shortcut?: string;
  execute: () => void | Promise<void>;
  enabled?: () => boolean; // Dynamic enable/disable
}

export interface PanelActionsConfig {
  panelId: string;
  panelName: string;
  actions: PanelAction[];
  defaultFaces?: Partial<Record<CubeFace, string>>; // Map face to action ID
}

class PanelActionRegistry {
  private registrations = new Map<string, PanelActionsConfig>();
  private listeners = new Set<() => void>();

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
    return this.registrations.get(panelId)?.actions || [];
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
    const config = this.registrations.get(panelId);
    return config?.actions.find((a) => a.id === actionId);
  }

  /**
   * Execute an action
   */
  async executeAction(panelId: string, actionId: string): Promise<boolean> {
    const action = this.getAction(panelId, actionId);
    if (!action) return false;

    // Check if action is enabled
    if (action.enabled && !action.enabled()) {
      console.warn(`Action ${actionId} is disabled`);
      return false;
    }

    try {
      await action.execute();
      return true;
    } catch (error) {
      console.error(`Failed to execute action ${actionId}:`, error);
      return false;
    }
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
        const action = config.actions.find((a) => a.id === actionId);
        if (action) {
          mappings[face as CubeFace] = action;
        }
      });
    }

    // Apply preferred face from individual actions (overrides defaults)
    config.actions.forEach((action) => {
      if (action.face && !mappings[action.face]) {
        mappings[action.face] = action;
      }
    });

    // Auto-assign remaining actions to empty faces
    const emptyFaces = (Object.keys(mappings) as CubeFace[]).filter(
      (face) => !mappings[face]
    );
    const unassignedActions = config.actions.filter(
      (action) => !Object.values(mappings).includes(action)
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
}

// Singleton instance
export const panelActionRegistry = new PanelActionRegistry();

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
    [panelId]
  );

  return {
    actions,
    config,
    executeAction,
    faceMappings: config ? panelActionRegistry.getFaceMappings(panelId) : null,
  };
}

// Export types
export type { PanelAction, PanelActionsConfig };

// Re-export singleton
export { panelActionRegistry as default };

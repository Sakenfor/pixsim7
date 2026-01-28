/**
 * Panel Manager
 *
 * Centralized orchestration for workspace panels, zones, and layouts.
 * Handles panel interactions, retraction, zone management, and dockview integration.
 */

import { getDockviewPanels, type DockviewHost } from '@lib/dockview';

import type {
  PanelMetadata,
  PanelState,
  ZoneState,
  PanelManagerState,
  PanelMode,
  PanelAction,
  WorkspaceZone,
  OpenPanelOptions,
  MovePanelOptions,
  PanelManagerEvent,
  PanelManagerListener,
  PanelManagerStateListener,
} from './types';

/**
 * Core panel manager class
 */
export class PanelManager {
  private panels = new Map<string, PanelState>();
  private metadata = new Map<string, PanelMetadata>();
  private zones = new Map<WorkspaceZone, ZoneState>();
  private eventListeners = new Set<PanelManagerListener>();
  private stateListeners = new Set<PanelManagerStateListener>();

  constructor() {
    // Initialize default zones
    const defaultZones: WorkspaceZone[] = ['left', 'right', 'center', 'bottom', 'top', 'floating'];
    defaultZones.forEach(zoneId => {
      this.zones.set(zoneId, {
        id: zoneId,
        panels: [],
      });
    });
  }

  // ==================== Registration ====================

  /**
   * Register a panel with metadata
   */
  registerPanel(metadata: PanelMetadata): void {
    if (this.metadata.has(metadata.id)) {
      console.warn(`[PanelManager] Panel "${metadata.id}" already registered, overwriting`);
    }

    this.metadata.set(metadata.id, metadata);

    const initialZone = metadata.defaultZone || 'center';

    this.panels.set(metadata.id, {
      id: metadata.id,
      isOpen: false,
      mode: 'normal',
      zone: initialZone,
      dockview: metadata.dockview?.hasDockview
        ? {
            isReady: false,
            subPanelStates: new Map(),
          }
        : undefined,
    });

    // Add to zone
    const zone = this.zones.get(initialZone);
    if (zone && !zone.panels.includes(metadata.id)) {
      zone.panels.push(metadata.id);
    }

    this.emitEvent({ type: 'state:changed' });
  }

  /**
   * Register multiple panels at once
   */
  registerPanels(metadataList: PanelMetadata[]): void {
    metadataList.forEach(metadata => this.registerPanel(metadata));
  }

  /**
   * Register a dockview host for a panel
   * Called by SmartDockview onReady callback
   */
  registerDockview(panelId: string, host: DockviewHost): void {
    const panel = this.panels.get(panelId);
    if (!panel?.dockview) {
      console.warn(`[PanelManager] Cannot register dockview for "${panelId}" - not a dockview panel`);
      return;
    }

    panel.dockview.isReady = true;
    panel.dockview.host = host;
    panel.dockview.api = host.api;

    // Track sub-panel states
    host.api.onDidAddPanel(e => {
      panel.dockview?.subPanelStates?.set(e.id, {
        isActive: e.api.isActive,
        isVisible: e.api.isVisible,
      });
      this.notifyStateListeners();
    });

    host.api.onDidRemovePanel(e => {
      panel.dockview?.subPanelStates?.delete(e.id);
      this.notifyStateListeners();
    });

    host.api.onDidActivePanelChange(() => {
      this.notifyStateListeners();
    });

    this.emitEvent({ type: 'dockview:registered', panelId });
    this.notifyStateListeners();
  }

  // ==================== Panel Operations ====================

  /**
   * Open a panel
   */
  openPanel(panelId: string, options: OpenPanelOptions = {}): void {
    const panel = this.panels.get(panelId);
    const meta = this.metadata.get(panelId);
    if (!panel || !meta) {
      console.warn(`[PanelManager] Cannot open unknown panel "${panelId}"`);
      return;
    }

    // Handle zone change if requested
    if (options.zone && options.zone !== panel.zone && meta.canChangeZone !== false) {
      this.movePanel(panelId, { toZone: options.zone });
    }

    panel.isOpen = true;
    panel.mode = 'normal';

    // Set as active in zone
    const zone = this.zones.get(panel.zone);
    if (zone) {
      zone.activePanel = panelId;
    }

    this.emitEvent({ type: 'panel:opened', panelId });

    // Apply interaction rules
    if (!options.skipRules) {
      this.applyInteractionRules(panelId, 'open');
    }

    this.notifyStateListeners();
  }

  /**
   * Close a panel
   */
  closePanel(panelId: string, options: { skipRules?: boolean } = {}): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;

    panel.isOpen = false;

    // Clear active state in zone
    const zone = this.zones.get(panel.zone);
    if (zone?.activePanel === panelId) {
      zone.activePanel = undefined;
    }

    this.emitEvent({ type: 'panel:closed', panelId });

    // Apply interaction rules
    if (!options.skipRules) {
      this.applyInteractionRules(panelId, 'close');
    }

    this.notifyStateListeners();
  }

  /**
   * Toggle panel open/closed
   */
  togglePanel(panelId: string): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;

    if (panel.isOpen) {
      this.closePanel(panelId);
    } else {
      this.openPanel(panelId);
    }
  }

  /**
   * Retract a panel (collapse to icon/thin bar)
   */
  retractPanel(panelId: string): void {
    const panel = this.panels.get(panelId);
    const meta = this.metadata.get(panelId);
    if (!panel || !meta?.retraction?.canRetract) {
      console.warn(`[PanelManager] Cannot retract panel "${panelId}"`);
      return;
    }

    panel.mode = 'retracted';
    panel.retractedDimensions = {
      width: meta.retraction.retractedWidth || 48,
      height: meta.retraction.retractedHeight || 48,
    };

    this.emitEvent({ type: 'panel:retracted', panelId });
    this.notifyStateListeners();
  }

  /**
   * Expand a panel (restore from retracted state)
   */
  expandPanel(panelId: string): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;

    panel.mode = 'normal';
    panel.retractedDimensions = undefined;

    this.emitEvent({ type: 'panel:expanded', panelId });
    this.notifyStateListeners();
  }

  /**
   * Toggle panel retraction
   */
  toggleRetraction(panelId: string): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;

    if (panel.mode === 'retracted') {
      this.expandPanel(panelId);
    } else {
      this.retractPanel(panelId);
    }
  }

  /**
   * Set panel mode directly
   */
  setPanelMode(panelId: string, mode: PanelMode): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;

    const oldMode = panel.mode;
    panel.mode = mode;

    if (mode === 'retracted' && oldMode !== 'retracted') {
      this.retractPanel(panelId);
    } else if (mode === 'normal' && oldMode === 'retracted') {
      this.expandPanel(panelId);
    } else {
      this.notifyStateListeners();
    }
  }

  /**
   * Focus a panel (make it active in its zone)
   */
  focusPanel(panelId: string): void {
    const panel = this.panels.get(panelId);
    if (!panel?.isOpen) return;

    const zone = this.zones.get(panel.zone);
    if (zone) {
      zone.activePanel = panelId;
    }

    this.emitEvent({ type: 'panel:focused', panelId });
    this.notifyStateListeners();
  }

  // ==================== Zone Operations ====================

  /**
   * Move a panel to a different zone
   */
  movePanel(panelId: string, options: MovePanelOptions): void {
    const panel = this.panels.get(panelId);
    const meta = this.metadata.get(panelId);
    if (!panel || !meta?.canChangeZone) {
      console.warn(`[PanelManager] Cannot move panel "${panelId}"`);
      return;
    }

    const fromZone = panel.zone;
    const { toZone, position, makeActive } = options;

    if (fromZone === toZone) return;

    // Remove from old zone
    const oldZone = this.zones.get(fromZone);
    if (oldZone) {
      oldZone.panels = oldZone.panels.filter(id => id !== panelId);
      if (oldZone.activePanel === panelId) {
        oldZone.activePanel = undefined;
      }
    }

    // Add to new zone
    const newZone = this.zones.get(toZone);
    if (newZone) {
      if (position !== undefined) {
        newZone.panels.splice(position, 0, panelId);
      } else {
        newZone.panels.push(panelId);
      }

      if (makeActive) {
        newZone.activePanel = panelId;
      }

      panel.zone = toZone;
    }

    this.emitEvent({ type: 'panel:moved', panelId, fromZone, toZone });
    this.notifyStateListeners();
  }

  /**
   * Get all panels in a zone
   */
  getPanelsInZone(zone: WorkspaceZone): PanelState[] {
    const zoneState = this.zones.get(zone);
    if (!zoneState) return [];

    return zoneState.panels
      .map(id => this.panels.get(id))
      .filter((p): p is PanelState => p !== undefined);
  }

  /**
   * Get active panel in a zone
   */
  getActivePanelInZone(zone: WorkspaceZone): PanelState | undefined {
    const zoneState = this.zones.get(zone);
    if (!zoneState?.activePanel) return undefined;

    return this.panels.get(zoneState.activePanel);
  }

  // ==================== Dockview Operations ====================

  /**
   * Breakout a sub-panel from dockview to floating window
   */
  breakoutSubPanel(parentPanelId: string, subPanelId: string): void {
    const parentPanel = this.panels.get(parentPanelId);
    const parentMeta = this.metadata.get(parentPanelId);

    const dockviewApi = parentPanel?.dockview?.host?.api ?? parentPanel?.dockview?.api;
    if (!dockviewApi || !parentMeta?.dockview?.subPanelsCanBreakout) {
      console.warn(`[PanelManager] Cannot breakout ${subPanelId} from ${parentPanelId}`);
      return;
    }

    const panel = getDockviewPanels(dockviewApi).find(p => p.id === subPanelId);
    if (!panel) return;

    // Remove from dockview
    dockviewApi.removePanel(panel);

    // Create floating panel ID
    const floatingPanelId = `${parentPanelId}:${subPanelId}:floating`;

    // Register as new top-level panel in floating zone
    this.registerPanel({
      id: floatingPanelId,
      title: panel.title || subPanelId,
      type: 'zone-panel',
      defaultZone: 'floating',
      canChangeZone: true,
      priority: 90, // Floating windows on top
    });

    this.openPanel(floatingPanelId, { zone: 'floating' });

    this.emitEvent({ type: 'subpanel:breakout', parentId: parentPanelId, subPanelId });
  }

  // ==================== Interaction Rules ====================

  /**
   * Apply interaction rules when a panel opens or closes
   */
  private applyInteractionRules(changedPanelId: string, action: 'open' | 'close'): void {
    this.metadata.forEach((metadata, panelId) => {
      if (panelId === changedPanelId) return;

      const rules = action === 'open'
        ? metadata.interactionRules?.whenOpens
        : metadata.interactionRules?.whenCloses;

      const rule = rules?.[changedPanelId];
      if (!rule || rule === 'nothing') return;

      const panel = this.panels.get(panelId);
      if (!panel?.isOpen) return;

      this.applyAction(panelId, rule);
    });
  }

  /**
   * Apply a specific action to a panel
   */
  private applyAction(panelId: string, action: PanelAction): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;

    switch (action) {
      case 'retract':
        this.retractPanel(panelId);
        break;
      case 'expand':
        this.expandPanel(panelId);
        break;
      case 'hide':
        panel.mode = 'hidden';
        this.notifyStateListeners();
        break;
      case 'show':
        panel.mode = 'normal';
        this.notifyStateListeners();
        break;
      case 'minimize':
        panel.mode = 'minimized';
        this.notifyStateListeners();
        break;
      case 'restore':
        panel.mode = 'normal';
        this.notifyStateListeners();
        break;
      case 'share':
        // TODO: Implement share/split logic
        console.log(`[PanelManager] Share action not yet implemented for ${panelId}`);
        break;
    }
  }

  // ==================== Getters ====================

  /**
   * Get panel state by ID
   */
  getPanelState(panelId: string): PanelState | undefined {
    return this.panels.get(panelId);
  }

  /**
   * Get panel metadata by ID
   */
  getPanelMetadata(panelId: string): PanelMetadata | undefined {
    return this.metadata.get(panelId);
  }

  /**
   * Get zone state by ID
   */
  getZoneState(zoneId: WorkspaceZone): ZoneState | undefined {
    return this.zones.get(zoneId);
  }

  /**
   * Get complete panel manager state
   */
  getState(): PanelManagerState {
    return {
      panels: new Map(this.panels),
      zones: new Map(this.zones),
      lastUpdate: Date.now(),
    };
  }

  /**
   * Get all registered panel IDs
   */
  getAllPanelIds(): string[] {
    return Array.from(this.panels.keys());
  }

  /**
   * Get all open panels
   */
  getOpenPanels(): PanelState[] {
    return Array.from(this.panels.values()).filter(p => p.isOpen);
  }

  // ==================== Events & Listeners ====================

  /**
   * Subscribe to panel manager events
   */
  on(listener: PanelManagerListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: PanelManagerStateListener): () => void {
    this.stateListeners.add(listener);
    // Immediately call with current state
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  /**
   * Emit an event to all listeners
   */
  private emitEvent(event: PanelManagerEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[PanelManager] Error in event listener:', error);
      }
    });
  }

  /**
   * Notify state listeners of state change
   */
  private notifyStateListeners(): void {
    const state = this.getState();
    this.stateListeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('[PanelManager] Error in state listener:', error);
      }
    });
  }

  // ==================== Debug ====================

  /**
   * Get debug info about current state
   */
  getDebugInfo(): Record<string, any> {
    return {
      panels: Array.from(this.panels.entries()).map(([id, state]) => ({
        id,
        ...state,
        metadata: this.metadata.get(id),
      })),
      zones: Array.from(this.zones.entries()).map(([id, state]) => ({
        id,
        ...state,
      })),
      listeners: {
        events: this.eventListeners.size,
        state: this.stateListeners.size,
      },
    };
  }
}

/**
 * Singleton instance
 */
export const panelManager = new PanelManager();

// Expose on window for debugging (development only)
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).__panelManager = panelManager;
}

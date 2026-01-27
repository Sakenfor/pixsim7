/**
 * Shared types for dockview host infrastructure.
 */

export interface PanelLookup {
  get(panelId: string): { title?: string } | undefined;
}

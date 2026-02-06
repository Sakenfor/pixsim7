/**
 * Safe Dockview API Wrapper
 *
 * Wraps DockviewApi with safe methods that handle common edge cases
 * like duplicate panel additions.
 */

import type { DockviewApi, AddPanelOptions, IDockviewPanel } from 'dockview';

export interface SafeDockviewApi extends Omit<DockviewApi, 'addPanel'> {
  /**
   * Add a panel, or return existing panel if it already exists.
   * Never throws on duplicate panel IDs.
   */
  addPanel: (options: AddPanelOptions) => IDockviewPanel;

  /**
   * Add a panel only if it doesn't exist. Returns the panel if added, undefined if skipped.
   */
  addPanelIfMissing: (options: AddPanelOptions) => IDockviewPanel | undefined;

  /** The underlying DockviewApi */
  readonly raw: DockviewApi;
}

/**
 * Create a safe wrapper around DockviewApi.
 *
 * Use this in `defaultLayout` callbacks to avoid "panel already exists" errors
 * when layouts are restored from storage before defaultLayout runs.
 *
 * @example
 * const defaultLayout = (api: DockviewApi) => {
 *   const safe = createSafeApi(api);
 *   safe.addPanel({ id: 'main', component: 'main' }); // Safe - won't throw if exists
 * };
 */
export function createSafeApi(api: DockviewApi): SafeDockviewApi {
  return {
    ...api,

    addPanel: (options: AddPanelOptions): IDockviewPanel => {
      const existing = api.getPanel(options.id);
      if (existing) return existing;
      return api.addPanel(options);
    },

    addPanelIfMissing: (options: AddPanelOptions): IDockviewPanel | undefined => {
      if (api.getPanel(options.id)) return undefined;
      return api.addPanel(options);
    },

    raw: api,
  } as SafeDockviewApi;
}

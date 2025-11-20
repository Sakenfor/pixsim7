import { useEffect } from 'react';
import { panelActionRegistry, type PanelActionsConfig } from '../lib/panelActions';

/**
 * Hook for panels to register their available actions
 *
 * Usage in a panel component:
 * ```tsx
 * function MyPanel() {
 *   useRegisterPanelActions({
 *     panelId: 'my-panel',
 *     panelName: 'My Panel',
 *     actions: [
 *       {
 *         id: 'create',
 *         label: 'Create',
 *         icon: '➕',
 *         description: 'Create new item',
 *         face: 'front',
 *         execute: () => handleCreate(),
 *       },
 *       // ... more actions
 *     ],
 *   });
 *
 *   return <div>Panel content</div>;
 * }
 * ```
 */
export function useRegisterPanelActions(config: PanelActionsConfig) {
  useEffect(() => {
    // Register on mount
    panelActionRegistry.register(config);

    // Unregister on unmount
    return () => {
      panelActionRegistry.unregister(config.panelId);
    };
  }, [config.panelId]); // Only re-register if panelId changes

  // Update actions if they change
  useEffect(() => {
    panelActionRegistry.update(config.panelId, config);
  }, [config.actions, config.defaultFaces, config.panelName]);
}

/**
 * Hook for panels to register simple actions without full config
 */
export function useRegisterSimpleActions(
  panelId: string,
  panelName: string,
  actions: PanelActionsConfig['actions']
) {
  useRegisterPanelActions({
    panelId,
    panelName,
    actions,
  });
}

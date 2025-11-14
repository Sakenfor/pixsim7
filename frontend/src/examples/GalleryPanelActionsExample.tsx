/**
 * Example: How to integrate panel actions with the Gallery/Assets panel
 *
 * This shows how any panel can register its actions dynamically,
 * which cube widgets will then expose when docked to that panel.
 */

import { useRegisterPanelActions } from '../hooks/useRegisterPanelActions';
import { useWorkspaceStore } from '../stores/workspaceStore';

/**
 * Example integration for the Gallery/Assets panel
 *
 * In the real AssetsRoute component, you would add this hook:
 */
export function useGalleryPanelActions() {
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);

  useRegisterPanelActions({
    panelId: 'gallery',
    panelName: 'Gallery',
    actions: [
      {
        id: 'view-grid',
        label: 'Grid',
        icon: '🖼️',
        description: 'Switch to grid view',
        face: 'front',
        shortcut: 'G',
        execute: () => {
          console.log('Switch to grid view');
          // Implementation: change view mode
        },
      },
      {
        id: 'filter',
        label: 'Filter',
        icon: '🎨',
        description: 'Filter assets by type',
        face: 'left',
        shortcut: 'F',
        execute: () => {
          console.log('Open filter menu');
          // Implementation: show filter dialog
        },
      },
      {
        id: 'upload',
        label: 'Upload',
        icon: '⬆️',
        description: 'Upload new assets',
        face: 'top',
        shortcut: 'U',
        execute: () => {
          console.log('Open upload dialog');
          // Implementation: show upload dialog
        },
      },
      {
        id: 'download',
        label: 'Download',
        icon: '⬇️',
        description: 'Download selected',
        face: 'bottom',
        execute: () => {
          console.log('Download selected assets');
          // Implementation: download logic
        },
        enabled: () => {
          // Only enable if something is selected
          // return hasSelectedAssets();
          return true;
        },
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: '🗑️',
        description: 'Delete selected assets',
        face: 'right',
        execute: () => {
          console.log('Delete selected assets');
          // Implementation: delete with confirmation
        },
        enabled: () => {
          // Only enable if something is selected
          return true;
        },
      },
      {
        id: 'organize',
        label: 'Organize',
        icon: '📁',
        description: 'Organize into folders',
        face: 'back',
        execute: () => {
          console.log('Open folder organizer');
          // Implementation: folder organization UI
        },
      },
    ],
    defaultFaces: {
      front: 'view-grid',
      left: 'filter',
      right: 'delete',
      top: 'upload',
      bottom: 'download',
      back: 'organize',
    },
  });
}

/**
 * Example for Scene Builder panel
 */
export function useScenePanelActions() {
  useRegisterPanelActions({
    panelId: 'scene',
    panelName: 'Scene Builder',
    actions: [
      {
        id: 'new-scene',
        label: 'New',
        icon: '🎬',
        description: 'Create new scene',
        face: 'front',
        execute: () => console.log('New scene'),
      },
      {
        id: 'add-layer',
        label: 'Layer',
        icon: '🎭',
        description: 'Add new layer',
        face: 'top',
        shortcut: 'L',
        execute: () => console.log('Add layer'),
      },
      {
        id: 'select-tool',
        label: 'Select',
        icon: '🎯',
        description: 'Selection tool',
        face: 'left',
        shortcut: 'V',
        execute: () => console.log('Select tool'),
      },
      {
        id: 'paint-tool',
        label: 'Paint',
        icon: '🎨',
        description: 'Paint tool',
        face: 'right',
        shortcut: 'B',
        execute: () => console.log('Paint tool'),
      },
      {
        id: 'zoom-fit',
        label: 'Fit',
        icon: '🔍',
        description: 'Zoom to fit',
        face: 'bottom',
        execute: () => console.log('Zoom fit'),
      },
      {
        id: 'export',
        label: 'Export',
        icon: '📤',
        description: 'Export scene',
        face: 'back',
        execute: () => console.log('Export scene'),
      },
    ],
  });
}

/**
 * Example for Graph panel
 */
export function useGraphPanelActions() {
  useRegisterPanelActions({
    panelId: 'graph',
    panelName: 'Graph',
    actions: [
      {
        id: 'add-node',
        label: 'Add',
        icon: '➕',
        description: 'Add new node',
        face: 'top',
        shortcut: 'A',
        execute: () => console.log('Add node'),
      },
      {
        id: 'connect',
        label: 'Connect',
        icon: '🔗',
        description: 'Connect nodes',
        face: 'front',
        shortcut: 'C',
        execute: () => console.log('Connect mode'),
      },
      {
        id: 'delete-node',
        label: 'Delete',
        icon: '🗑️',
        description: 'Delete selected',
        face: 'bottom',
        shortcut: 'Del',
        execute: () => console.log('Delete nodes'),
      },
      {
        id: 'auto-layout',
        label: 'Layout',
        icon: '✨',
        description: 'Auto arrange',
        face: 'back',
        execute: () => console.log('Auto layout'),
      },
      {
        id: 'zoom-fit',
        label: 'Fit',
        icon: '🔍',
        description: 'Fit to view',
        face: 'left',
        execute: () => console.log('Zoom fit'),
      },
      {
        id: 'run',
        label: 'Run',
        icon: '▶️',
        description: 'Execute graph',
        face: 'right',
        execute: () => console.log('Run graph'),
      },
    ],
  });
}

/**
 * To integrate with actual panels, add the hook call:
 *
 * ```tsx
 * // In AssetsRoute component:
 * export function AssetsRoute() {
 *   useGalleryPanelActions(); // Add this line
 *
 *   return (
 *     <div data-panel-id="gallery">
 *       // ... existing component code
 *     </div>
 *   );
 * }
 * ```
 */

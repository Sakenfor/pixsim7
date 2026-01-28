/**
 * Workspace Console Manifest
 *
 * Declares workspace and selection operations.
 * This is the single source of truth for workspace/selection console ops.
 */

import { categoryOps, param } from '@lib/dev/console/manifests/helpers';
import type { ConsoleManifest } from '@lib/dev/console/manifests/types';

import { useSelectionStore } from '@features/graph';
import { getWorkspaceDockviewHost } from '@features/workspace';

import { useWorkspaceStore } from '../stores/workspaceStore';


/** Storage key for workspace layout (must match DockviewWorkspace) */
const WORKSPACE_STORAGE_KEY = 'dockview:workspace:v4';

/**
 * Workspace console manifest
 *
 * Registers:
 * - Workspace operations (loadPreset, savePreset, listPresets, toggleLock, reset)
 * - Selection operations (clear, select, list)
 */
export const workspaceManifest: ConsoleManifest = {
  id: 'workspace',
  name: 'Workspace',
  description: 'Workspace layout and selection operations',
  dependencies: ['core'],

  ops: {
    categories: [
      {
        id: 'workspace',
        name: 'Workspace',
        description: 'Workspace layout and preset operations',
      },
      {
        id: 'selection',
        name: 'Selection',
        description: 'Node selection operations',
      },
    ],
    operations: [
      // Workspace Operations
      ...categoryOps('workspace', {
        loadPreset: {
          name: 'Load Preset',
          description: 'Load a workspace preset by ID',
          execute: (presetId: unknown) => {
            if (typeof presetId !== 'string') throw new Error('presetId must be a string');

            const host = getWorkspaceDockviewHost();
            const api = host?.api;
            if (!api) throw new Error('Workspace dockview not available');

            const store = useWorkspaceStore.getState();
            const layout = store.getPresetLayout(presetId);

            if (layout) {
              api.fromJSON(layout);
            } else {
              localStorage.removeItem(WORKSPACE_STORAGE_KEY);
              throw new Error('Preset has null layout - please reload the page');
            }

            store.setActivePreset('workspace', presetId);
            return `Loaded preset: ${presetId}`;
          },
          params: [param('presetId', 'string', true, 'Preset ID to load')],
        },
        savePreset: {
          name: 'Save Preset',
          description: 'Save current layout as a new preset',
          execute: (name: unknown) => {
            if (typeof name !== 'string') throw new Error('name must be a string');

            const host = getWorkspaceDockviewHost();
            const api = host?.api;
            if (!api) throw new Error('Workspace dockview not available');

            const layout = api.toJSON();
            useWorkspaceStore.getState().savePreset(name, 'workspace', layout);
            return `Saved preset: ${name}`;
          },
          params: [param('name', 'string', true, 'Name for the new preset')],
        },
        listPresets: {
          name: 'List Presets',
          description: 'List all available workspace presets',
          execute: () => {
            const presets = useWorkspaceStore.getState().presets;
            return presets.map((p) => ({ id: p.id, name: p.name, icon: p.icon }));
          },
        },
        toggleLock: {
          name: 'Toggle Lock',
          description: 'Toggle workspace layout lock',
          execute: () => {
            useWorkspaceStore.getState().toggleLock();
            const isLocked = useWorkspaceStore.getState().isLocked;
            return `Workspace ${isLocked ? 'locked' : 'unlocked'}`;
          },
        },
        reset: {
          name: 'Reset',
          description: 'Reset workspace to default',
          execute: () => {
            useWorkspaceStore.getState().reset();
            return 'Workspace reset to default';
          },
        },
      }),
      // Selection Operations
      ...categoryOps('selection', {
        clear: {
          name: 'Clear Selection',
          description: 'Clear all selected nodes',
          execute: () => {
            useSelectionStore.getState().setSelectedNodeIds([]);
            return 'Selection cleared';
          },
        },
        select: {
          name: 'Select Nodes',
          description: 'Select nodes by ID',
          execute: (nodeIds: unknown) => {
            if (!Array.isArray(nodeIds)) throw new Error('nodeIds must be an array');
            useSelectionStore.getState().setSelectedNodeIds(nodeIds as string[]);
            return `Selected ${nodeIds.length} nodes`;
          },
          params: [param('nodeIds', 'string[]', true, 'Array of node IDs')],
        },
        list: {
          name: 'List Selected',
          description: 'Get currently selected node IDs',
          execute: () => {
            return useSelectionStore.getState().selectedNodeIds;
          },
        },
      }),
    ],
  },
};

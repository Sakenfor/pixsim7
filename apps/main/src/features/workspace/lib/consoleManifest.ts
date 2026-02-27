/**
 * Workspace Console Manifest
 *
 * Declares workspace and selection operations.
 * This is the single source of truth for workspace/selection console ops.
 */

import { categoryOps, param } from '@lib/dev/console/manifests/helpers';
import type { ConsoleManifest } from '@lib/dev/console/manifests/types';

import { useSelectionStore } from '@features/graph';

import { useWorkspaceStore } from '../stores/workspaceStore';

import { applyWorkspacePreset } from './layoutRecipes';
import { resolveWorkspaceDockview } from './resolveWorkspaceDockview';

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

            if (!applyWorkspacePreset(presetId)) {
              throw new Error(`Preset not found: ${presetId}`);
            }

            useWorkspaceStore.getState().setActivePreset('workspace', presetId);
            return `Loaded preset: ${presetId}`;
          },
          params: [param('presetId', 'string', true, 'Preset ID to load')],
        },
        savePreset: {
          name: 'Save Preset',
          description: 'Save current layout as a new preset',
          execute: (name: unknown) => {
            if (typeof name !== 'string') throw new Error('name must be a string');

            const host = resolveWorkspaceDockview().host;
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
            const presets = useWorkspaceStore.getState().getPresetsForScope('workspace');
            return presets.map((p) => ({ id: p.id, name: p.name, icon: p.icon, isDefault: p.isDefault }));
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

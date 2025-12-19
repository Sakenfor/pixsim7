/**
 * Register Core Operations
 *
 * Registers core operations with the ops registry
 * so they're accessible via pixsim.ops.*
 */

import { opsRegistry } from './opsRegistry';
import { useWorkspaceStore } from '@features/workspace';
import { useSelectionStore } from '@/stores/selectionStore';
import { useConsoleStore } from './consoleStore';

/**
 * Register all core operations
 */
export function registerCoreOps(): void {
  // ─────────────────────────────────────────────────────────────
  // Workspace Operations
  // ─────────────────────────────────────────────────────────────
  opsRegistry.registerCategory('workspace', 'Workspace', 'Workspace layout and preset operations');

  opsRegistry.register('workspace', {
    id: 'loadPreset',
    name: 'Load Preset',
    description: 'Load a workspace preset by ID',
    execute: (presetId: unknown) => {
      if (typeof presetId !== 'string') throw new Error('presetId must be a string');
      useWorkspaceStore.getState().loadPreset(presetId);
      return `Loaded preset: ${presetId}`;
    },
    params: [{ name: 'presetId', type: 'string', required: true, description: 'Preset ID to load' }],
  });

  opsRegistry.register('workspace', {
    id: 'savePreset',
    name: 'Save Preset',
    description: 'Save current layout as a new preset',
    execute: (name: unknown) => {
      if (typeof name !== 'string') throw new Error('name must be a string');
      const store = useWorkspaceStore.getState();
      store.savePreset(name, 'workspace', store.getLayout('workspace'));
      return `Saved preset: ${name}`;
    },
    params: [{ name: 'name', type: 'string', required: true, description: 'Name for the new preset' }],
  });

  opsRegistry.register('workspace', {
    id: 'listPresets',
    name: 'List Presets',
    description: 'List all available workspace presets',
    execute: () => {
      const presets = useWorkspaceStore.getState().presets;
      return presets.map((p) => ({ id: p.id, name: p.name, icon: p.icon }));
    },
  });

  opsRegistry.register('workspace', {
    id: 'toggleLock',
    name: 'Toggle Lock',
    description: 'Toggle workspace layout lock',
    execute: () => {
      useWorkspaceStore.getState().toggleLock();
      const isLocked = useWorkspaceStore.getState().isLocked;
      return `Workspace ${isLocked ? 'locked' : 'unlocked'}`;
    },
  });

  opsRegistry.register('workspace', {
    id: 'reset',
    name: 'Reset',
    description: 'Reset workspace to default',
    execute: () => {
      useWorkspaceStore.getState().reset();
      return 'Workspace reset to default';
    },
  });

  // ─────────────────────────────────────────────────────────────
  // Selection Operations
  // ─────────────────────────────────────────────────────────────
  opsRegistry.registerCategory('selection', 'Selection', 'Node selection operations');

  opsRegistry.register('selection', {
    id: 'clear',
    name: 'Clear Selection',
    description: 'Clear all selected nodes',
    execute: () => {
      useSelectionStore.getState().clearSelection();
      return 'Selection cleared';
    },
  });

  opsRegistry.register('selection', {
    id: 'select',
    name: 'Select Nodes',
    description: 'Select nodes by ID',
    execute: (nodeIds: unknown) => {
      if (!Array.isArray(nodeIds)) throw new Error('nodeIds must be an array');
      useSelectionStore.getState().selectNodes(nodeIds as string[]);
      return `Selected ${nodeIds.length} nodes`;
    },
    params: [{ name: 'nodeIds', type: 'string[]', required: true, description: 'Array of node IDs' }],
  });

  opsRegistry.register('selection', {
    id: 'list',
    name: 'List Selected',
    description: 'Get currently selected node IDs',
    execute: () => {
      return useSelectionStore.getState().selectedNodeIds;
    },
  });

  // ─────────────────────────────────────────────────────────────
  // Console Operations
  // ─────────────────────────────────────────────────────────────
  opsRegistry.registerCategory('console', 'Console', 'Console operations');

  opsRegistry.register('console', {
    id: 'clear',
    name: 'Clear Console',
    description: 'Clear console history',
    execute: () => {
      useConsoleStore.getState().clear();
      return undefined; // clear() adds its own message
    },
  });

  opsRegistry.register('console', {
    id: 'help',
    name: 'Help',
    description: 'Show console help',
    execute: () => {
      return `
Available namespaces:
  pixsim.context  - Current editor state
  pixsim.data     - All data stores
  pixsim.ops      - Operations

Use .__keys__ to list available items
Use .__help__ for detailed info

Examples:
  pixsim.data.__keys__
  pixsim.ops.workspace.listPresets()
  pixsim.context.scene

Tool Commands:
  pixsim.ops.tools.list()           - List all tools
  pixsim.ops.tools.select('feather') - Select a tool
  pixsim.ops.tools.setPressure(0.8) - Override pressure
  pixsim.ops.tools.setSpeed(0.5)    - Override speed
  pixsim.ops.tools.unlockAll()      - [CHEAT] Unlock all
  pixsim.ops.gizmos.list()          - List all gizmos
      `.trim();
    },
  });
}

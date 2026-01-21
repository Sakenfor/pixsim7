/**
 * Demo Panel Compositions
 *
 * Pre-built compositions showcasing the data binding system (Task 51)
 * integrated with Panel Builder widgets (Task 50.4).
 */

import { createBinding } from '../../dataBinding';

import type { PanelComposition } from './panelComposer';

/**
 * Workspace Status Dashboard
 *
 * Demonstrates binding to workspace state:
 * - Lock status (boolean)
 * - Panel counts (arrays with transforms)
 * - Panel lists (arrays)
 */
export const workspaceStatusComposition: PanelComposition = {
  id: 'demo-workspace-status',
  name: 'Workspace Status Dashboard',
  layout: {
    type: 'grid',
    columns: 12,
    rows: 8,
    gap: 8,
  },
  dataSources: [
    // Core workspace sources are auto-registered by coreDataSources
    // This composition relies on those pre-registered sources
  ],
  widgets: [
    // Row 1: Status metrics
    {
      id: 'w1',
      widgetType: 'metric',
      position: { x: 0, y: 0, w: 3, h: 2 },
      config: {
        label: 'Workspace Status',
        format: 'text',
        color: '#3b82f6',
      },
      dataBindings: {
        value: createBinding(
          'b1',
          'workspace.isLocked',
          'value',
          {
            transformId: 'bool-to-lock-status',
            fallbackValue: 'Unknown',
          }
        ),
      },
    },
    {
      id: 'w2',
      widgetType: 'metric',
      position: { x: 3, y: 0, w: 3, h: 2 },
      config: {
        label: 'Closed Panels',
        format: 'number',
        color: '#ef4444',
      },
      dataBindings: {
        value: createBinding(
          'b2',
          'workspace.closedPanels.count',
          'value',
          {
            fallbackValue: 0,
          }
        ),
      },
    },
    {
      id: 'w3',
      widgetType: 'metric',
      position: { x: 6, y: 0, w: 3, h: 2 },
      config: {
        label: 'Floating Panels',
        format: 'number',
        color: '#8b5cf6',
      },
      dataBindings: {
        value: createBinding(
          'b3',
          'workspace.floatingPanels.count',
          'value',
          {
            fallbackValue: 0,
          }
        ),
      },
    },
    {
      id: 'w4',
      widgetType: 'metric',
      position: { x: 9, y: 0, w: 3, h: 2 },
      config: {
        label: 'Active Presets',
        format: 'number',
        color: '#10b981',
      },
      dataBindings: {
        value: createBinding(
          'b4',
          'workspace.presets.count',
          'value',
          {
            fallbackValue: 0,
          }
        ),
      },
    },

    // Row 2-3: Panel lists
    {
      id: 'w5',
      widgetType: 'list',
      position: { x: 0, y: 2, w: 6, h: 3 },
      config: {
        title: 'Closed Panels',
        itemKey: 'id',
        emptyMessage: 'No closed panels',
        searchable: true,
        sortable: true,
      },
      dataBindings: {
        items: createBinding(
          'b5',
          'workspace.closedPanels',
          'items',
          {
            fallbackValue: [],
          }
        ),
      },
    },
    {
      id: 'w6',
      widgetType: 'list',
      position: { x: 6, y: 2, w: 6, h: 3 },
      config: {
        title: 'Floating Panels',
        itemKey: 'id',
        emptyMessage: 'No floating panels',
        searchable: true,
        sortable: true,
      },
      dataBindings: {
        items: createBinding(
          'b6',
          'workspace.floatingPanels',
          'items',
          {
            fallbackValue: [],
          }
        ),
      },
    },

    // Row 4: Text displays
    {
      id: 'w7',
      widgetType: 'text',
      position: { x: 0, y: 5, w: 12, h: 1 },
      config: {
        content: 'Profile Name',
        align: 'center',
        size: 'lg',
        weight: 'semibold',
      },
      dataBindings: {
        content: createBinding(
          'b7',
          'workspace.activeProfile.name',
          'content',
          {
            fallbackValue: 'Default Profile',
          }
        ),
      },
    },
  ],
  styles: {
    backgroundColor: '#f5f5f5',
  },
};

/**
 * Game State Monitor
 *
 * Demonstrates binding to game state:
 * - Context fields (mode, world, session)
 * - Nested object access
 */
export const gameStateComposition: PanelComposition = {
  id: 'demo-game-state',
  name: 'Game State Monitor',
  layout: {
    type: 'grid',
    columns: 12,
    rows: 6,
    gap: 8,
  },
  dataSources: [],
  widgets: [
    {
      id: 'w1',
      widgetType: 'metric',
      position: { x: 0, y: 0, w: 3, h: 2 },
      config: {
        label: 'Game Mode',
        format: 'text',
        color: '#3b82f6',
      },
      dataBindings: {
        value: createBinding(
          'b1',
          'game.context.mode',
          'value',
          {
            transformId: 'uppercase',
            fallbackValue: 'N/A',
          }
        ),
      },
    },
    {
      id: 'w2',
      widgetType: 'text',
      position: { x: 3, y: 0, w: 4, h: 2 },
      config: {
        content: 'World ID',
        align: 'left',
        size: 'base',
        weight: 'medium',
      },
      dataBindings: {
        content: createBinding(
          'b2',
          'game.context.worldId',
          'content',
          {
            transformId: 'to-string',
            fallbackValue: 'No world loaded',
          }
        ),
      },
    },
    {
      id: 'w3',
      widgetType: 'text',
      position: { x: 7, y: 0, w: 5, h: 2 },
      config: {
        content: 'Session ID',
        align: 'left',
        size: 'base',
        weight: 'medium',
      },
      dataBindings: {
        content: createBinding(
          'b3',
          'game.context.sessionId',
          'content',
          {
            transformId: 'to-string',
            fallbackValue: 'No active session',
          }
        ),
      },
    },
    {
      id: 'w4',
      widgetType: 'text',
      position: { x: 0, y: 2, w: 12, h: 2 },
      config: {
        content: 'Full Game Context',
        align: 'center',
        size: 'sm',
        weight: 'normal',
      },
      dataBindings: {
        content: createBinding(
          'b4',
          'game.context',
          'content',
          {
            transformId: 'to-json',
            fallbackValue: '{}',
          }
        ),
      },
    },
  ],
};

/**
 * Mixed Data Dashboard
 *
 * Demonstrates combining workspace and game state in one panel
 */
export const mixedDataComposition: PanelComposition = {
  id: 'demo-mixed-data',
  name: 'Mixed Data Dashboard',
  layout: {
    type: 'grid',
    columns: 12,
    rows: 8,
    gap: 8,
  },
  dataSources: [],
  widgets: [
    // Workspace section
    {
      id: 'w1',
      widgetType: 'text',
      position: { x: 0, y: 0, w: 12, h: 1 },
      config: {
        content: 'WORKSPACE',
        align: 'center',
        size: 'xl',
        weight: 'bold',
        color: '#3b82f6',
      },
    },
    {
      id: 'w2',
      widgetType: 'metric',
      position: { x: 0, y: 1, w: 4, h: 2 },
      config: {
        label: 'Lock Status',
        format: 'text',
      },
      dataBindings: {
        value: createBinding(
          'b1',
          'workspace.isLocked',
          'value',
          {
            transformId: 'bool-to-lock-status',
            fallbackValue: 'Unknown',
          }
        ),
      },
    },
    {
      id: 'w3',
      widgetType: 'metric',
      position: { x: 4, y: 1, w: 4, h: 2 },
      config: {
        label: 'Total Panels',
        format: 'number',
      },
      dataBindings: {
        value: createBinding(
          'b2',
          'workspace.closedPanels.count',
          'value',
          {
            fallbackValue: 0,
          }
        ),
      },
    },
    {
      id: 'w4',
      widgetType: 'list',
      position: { x: 8, y: 1, w: 4, h: 2 },
      config: {
        title: 'Presets',
        itemKey: 'name',
        maxItems: 3,
      },
      dataBindings: {
        items: createBinding(
          'b3',
          'workspace.presets',
          'items',
          {
            fallbackValue: [],
          }
        ),
      },
    },

    // Game section
    {
      id: 'w5',
      widgetType: 'text',
      position: { x: 0, y: 4, w: 12, h: 1 },
      config: {
        content: 'GAME STATE',
        align: 'center',
        size: 'xl',
        weight: 'bold',
        color: '#10b981',
      },
    },
    {
      id: 'w6',
      widgetType: 'metric',
      position: { x: 0, y: 5, w: 4, h: 2 },
      config: {
        label: 'Mode',
        format: 'text',
      },
      dataBindings: {
        value: createBinding(
          'b4',
          'game.context.mode',
          'value',
          {
            transformId: 'uppercase',
            fallbackValue: 'N/A',
          }
        ),
      },
    },
    {
      id: 'w7',
      widgetType: 'text',
      position: { x: 4, y: 5, w: 4, h: 2 },
      config: {
        content: 'World',
        align: 'center',
        size: 'base',
        weight: 'medium',
      },
      dataBindings: {
        content: createBinding(
          'b5',
          'game.context.worldId',
          'content',
          {
            transformId: 'to-string',
            fallbackValue: 'None',
          }
        ),
      },
    },
    {
      id: 'w8',
      widgetType: 'text',
      position: { x: 8, y: 5, w: 4, h: 2 },
      config: {
        content: 'Session',
        align: 'center',
        size: 'base',
        weight: 'medium',
      },
      dataBindings: {
        content: createBinding(
          'b6',
          'game.context.sessionId',
          'content',
          {
            transformId: 'to-string',
            fallbackValue: 'None',
          }
        ),
      },
    },
  ],
};

/**
 * All available demo compositions
 */
export const demoCompositions = {
  workspaceStatus: workspaceStatusComposition,
  gameState: gameStateComposition,
  mixedData: mixedDataComposition,
};

/**
 * Get a demo composition by ID
 */
export function getDemoComposition(id: string): PanelComposition | undefined {
  const demos: Record<string, PanelComposition> = {
    'demo-workspace-status': workspaceStatusComposition,
    'demo-game-state': gameStateComposition,
    'demo-mixed-data': mixedDataComposition,
  };

  return demos[id];
}

/**
 * Get all demo composition IDs
 */
export function getDemoCompositionIds(): string[] {
  return [
    'demo-workspace-status',
    'demo-game-state',
    'demo-mixed-data',
  ];
}

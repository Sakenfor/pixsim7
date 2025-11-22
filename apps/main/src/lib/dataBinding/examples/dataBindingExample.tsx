/**
 * Data Binding System - Example Usage
 *
 * This file demonstrates how to use the data binding system
 * in a Panel Builder widget.
 */

import React from 'react';
import {
  dataSourceRegistry,
  createStoreSource,
  createStaticSource,
  createComputedSource,
  createBinding,
  useBindingValue,
  useBindingValues,
  useDataSourceRegistry,
  initializeCoreDataSources,
} from '..';
import type { DataBinding } from '..';

/**
 * Example 1: Simple widget with a single binding
 */
interface StatusBadgeProps {
  binding?: DataBinding;
}

export function StatusBadge({ binding }: StatusBadgeProps) {
  const isLocked = useBindingValue<boolean>(binding);

  return (
    <div className="flex items-center gap-2">
      <span>{isLocked ? '🔒 Locked' : '🔓 Unlocked'}</span>
    </div>
  );
}

/**
 * Example 2: Widget with multiple bindings
 */
interface PanelStatsProps {
  dataBindings?: Record<string, DataBinding>;
}

export function PanelStats({ dataBindings }: PanelStatsProps) {
  const values = useBindingValues(dataBindings);

  return (
    <div className="space-y-2">
      <div>Closed Panels: {values.closedCount || 0}</div>
      <div>Floating Panels: {values.floatingCount || 0}</div>
      <div>Workspace Locked: {values.isLocked ? 'Yes' : 'No'}</div>
    </div>
  );
}

/**
 * Example 3: Data source picker (for builder UI)
 */
export function DataSourcePicker() {
  const { sources, searchSources } = useDataSourceRegistry();
  const [query, setQuery] = React.useState('');

  const filteredSources = query ? searchSources(query) : sources;

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search data sources..."
        className="w-full px-3 py-2 border rounded"
      />
      <div className="max-h-64 overflow-y-auto">
        {filteredSources.map((source) => (
          <div key={source.id} className="p-2 border-b hover:bg-gray-50">
            <div className="font-medium">{source.label}</div>
            <div className="text-sm text-gray-600">{source.description}</div>
            <div className="text-xs text-gray-400">
              {source.type} • {source.id}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Example 4: Setting up custom data sources
 */
export function setupCustomDataSources() {
  // Initialize core sources first
  initializeCoreDataSources();

  // Add a custom static source
  dataSourceRegistry.registerSource(
    createStaticSource('app.version', 'Application Version', '1.0.0', {
      description: 'Current application version',
      tags: ['app', 'meta'],
    })
  );

  // Add a custom computed source
  dataSourceRegistry.registerSource(
    createStaticSource('stats.users', 'User Count', 42, {
      tags: ['stats'],
    })
  );

  dataSourceRegistry.registerSource(
    createStaticSource('stats.sessions', 'Session Count', 15, {
      tags: ['stats'],
    })
  );

  dataSourceRegistry.registerSource(
    createComputedSource(
      'stats.total',
      'Total Stats',
      ['stats.users', 'stats.sessions'],
      'sum',
      {
        description: 'Sum of users and sessions',
        tags: ['stats', 'computed'],
      }
    )
  );

  // Add a custom transform
  dataSourceRegistry.registerTransform({
    id: 'format-percentage',
    label: 'Format as Percentage',
    description: 'Formats a decimal as a percentage (0.5 → "50%")',
    apply: (input: unknown) => {
      const num = Number(input);
      return `${(num * 100).toFixed(1)}%`;
    },
  });
}

/**
 * Example 5: Creating bindings programmatically
 */
export function createExampleBindings() {
  return {
    // Simple binding to workspace lock state
    isLocked: createBinding('b1', 'workspace.isLocked', 'isLocked', {
      fallbackValue: false,
    }),

    // Binding with transform
    closedCount: createBinding('b2', 'workspace.closedPanels.count', 'closedCount', {
      fallbackValue: 0,
      transformId: 'to-string', // Convert number to string
    }),

    // Binding to game context
    gameMode: createBinding('b3', 'game.context.mode', 'gameMode', {
      fallbackValue: 'unknown',
    }),
  };
}

/**
 * Example 6: Complete widget with setup
 */
export function CompleteExample() {
  React.useEffect(() => {
    setupCustomDataSources();
  }, []);

  const bindings = createExampleBindings();

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Data Binding Examples</h2>

      <section>
        <h3 className="font-semibold mb-2">1. Status Badge</h3>
        <StatusBadge binding={bindings.isLocked} />
      </section>

      <section>
        <h3 className="font-semibold mb-2">2. Panel Stats</h3>
        <PanelStats dataBindings={bindings} />
      </section>

      <section>
        <h3 className="font-semibold mb-2">3. Data Source Picker</h3>
        <DataSourcePicker />
      </section>
    </div>
  );
}

/**
 * Example 7: Usage in Panel Builder
 *
 * This shows how the Panel Builder (Task 50.4) would integrate
 * with the data binding system.
 */
export interface WidgetInstance {
  id: string;
  type: string;
  props: Record<string, unknown>;
  dataBindings: Record<string, DataBinding>;
}

export function renderWidget(widget: WidgetInstance) {
  // The builder would look up the widget component by type
  // and pass the resolved binding values as props

  const Component = getWidgetComponent(widget.type);

  return (
    <WidgetWithBindings
      widget={widget}
      Component={Component}
    />
  );
}

function WidgetWithBindings({
  widget,
  Component,
}: {
  widget: WidgetInstance;
  Component: React.ComponentType<any>;
}) {
  // Resolve all bindings
  const bindingValues = useBindingValues(widget.dataBindings);

  // Merge static props with resolved binding values
  const props = {
    ...widget.props,
    ...bindingValues,
  };

  return <Component {...props} />;
}

// Mock function (would be implemented in Panel Builder)
function getWidgetComponent(type: string): React.ComponentType<any> {
  const components: Record<string, React.ComponentType<any>> = {
    'status-badge': StatusBadge,
    'panel-stats': PanelStats,
  };

  return components[type] || (() => <div>Unknown widget type: {type}</div>);
}

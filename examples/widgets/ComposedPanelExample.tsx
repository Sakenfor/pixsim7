/**
 * Composed Panel Example
 *
 * Complete example showing how to:
 * 1. Register widgets
 * 2. Create data sources
 * 3. Create a panel composition with data bindings
 * 4. Render the composed panel with live data
 *
 * Integrates Task 50.4 (Panel Builder) with Task 51 (Data Binding)
 */

import React from 'react';
import { widgetRegistry } from '@lib/widgets';
import { createComposition, addWidget, ComposedPanel } from '@lib/ui/composer';
import {
  initializeCoreDataSources,
  createStoreSource,
  createBinding,
} from '@lib/dataBinding';
import { metricWidgetDefinition } from './MetricWidget';
import type { PanelComposition } from '@lib/ui/composer';

/**
 * Initialize the example
 */
export function initializeExample() {
  // 1. Initialize core data sources (workspace, game-state, etc.)
  initializeCoreDataSources();

  // 2. Register example widgets
  widgetRegistry.register(metricWidgetDefinition);
}

/**
 * Create an example panel composition
 */
export function createExampleComposition(): PanelComposition {
  // 1. Create a new composition
  let composition = createComposition(
    'workspace-metrics',
    'Workspace Metrics Dashboard',
    12, // 12 columns
    6 // 6 rows
  );

  // 2. Add data sources
  composition.dataSources = [
    createStoreSource(
      'closed-panels-count',
      'Closed Panels Count',
      'workspace',
      'closedPanels.length',
      {
        description: 'Number of closed panels',
        tags: ['workspace', 'panels'],
      }
    ),
    createStoreSource(
      'floating-panels-count',
      'Floating Panels Count',
      'workspace',
      'floatingPanels.length',
      {
        description: 'Number of floating panels',
        tags: ['workspace', 'panels'],
      }
    ),
    createStoreSource(
      'presets-count',
      'Presets Count',
      'workspace',
      'presets.length',
      {
        description: 'Number of workspace presets',
        tags: ['workspace', 'presets'],
      }
    ),
  ];

  // 3. Add widgets with data bindings

  // Metric Widget #1 - Closed Panels
  composition = addWidget(
    composition,
    'metric',
    { x: 0, y: 0, w: 4, h: 2 },
    {
      label: 'Closed Panels',
      color: '#ef4444',
      size: 'medium',
    }
  );

  // Add data binding for the first widget
  composition.widgets[0].dataBindings = {
    value: createBinding(
      'widget-0-value',
      'closed-panels-count',
      'value',
      {
        fallbackValue: 0,
      }
    ),
  };

  // Metric Widget #2 - Floating Panels
  composition = addWidget(
    composition,
    'metric',
    { x: 4, y: 0, w: 4, h: 2 },
    {
      label: 'Floating Panels',
      color: '#3b82f6',
      size: 'medium',
    }
  );

  composition.widgets[1].dataBindings = {
    value: createBinding(
      'widget-1-value',
      'floating-panels-count',
      'value',
      {
        fallbackValue: 0,
      }
    ),
  };

  // Metric Widget #3 - Presets
  composition = addWidget(
    composition,
    'metric',
    { x: 8, y: 0, w: 4, h: 2 },
    {
      label: 'Saved Presets',
      color: '#10b981',
      size: 'medium',
    }
  );

  composition.widgets[2].dataBindings = {
    value: createBinding(
      'widget-2-value',
      'presets-count',
      'value',
      {
        fallbackValue: 0,
      }
    ),
  };

  // Add description and metadata
  composition.description = 'Live metrics for workspace state';
  composition.icon = '📊';

  return composition;
}

/**
 * Example Component that renders the composed panel
 */
export function ComposedPanelExample() {
  const [composition, setComposition] = React.useState<PanelComposition | null>(null);

  React.useEffect(() => {
    // Initialize widgets and data sources
    initializeExample();

    // Create the composition
    const comp = createExampleComposition();
    setComposition(comp);
  }, []);

  if (!composition) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-2xl font-bold">{composition.name}</h2>
        <p className="text-gray-600">{composition.description}</p>
      </div>

      <div className="h-96 border border-gray-200 rounded-lg overflow-hidden">
        <ComposedPanel composition={composition} />
      </div>

      <div className="mt-4 p-4 bg-gray-50 rounded">
        <h3 className="font-semibold mb-2">Composition Details:</h3>
        <ul className="text-sm space-y-1">
          <li>• Widgets: {composition.widgets.length}</li>
          <li>• Data Sources: {composition.dataSources?.length || 0}</li>
          <li>• Grid: {composition.layout.columns}x{composition.layout.rows}</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * Export the composition as JSON (for saving/loading)
 */
export function exportExample() {
  const composition = createExampleComposition();
  return JSON.stringify(composition, null, 2);
}

/**
 * Console helper to view the example composition structure
 */
if (typeof window !== 'undefined') {
  (window as any).viewExampleComposition = () => {
    const composition = createExampleComposition();
    console.log('Example Panel Composition:', composition);
    console.log('Data Sources:', composition.dataSources);
    console.log('Widgets:', composition.widgets);
    console.log('\nTo export as JSON:');
    console.log(JSON.stringify(composition, null, 2));
  };

  console.log('💡 Try running: viewExampleComposition() in the console');
}

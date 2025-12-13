/**
 * Composed Panel Component
 *
 * Renders a panel composition with live data binding.
 * Integrates Task 50.4 (Panel Composer) with Task 51 (Data Binding System)
 */

import React from 'react';
import type { PanelComposition } from './panelComposer';
import { widgetRegistry } from './widgetRegistry';
import { useBindingValues, dataSourceRegistry } from '../../dataBinding';

interface ComposedPanelProps {
  composition: PanelComposition;
}

/**
 * Renders a panel composition with widgets and live data bindings
 */
export function ComposedPanel({ composition }: ComposedPanelProps) {
  // Register all data sources from the composition
  React.useEffect(() => {
    if (composition.dataSources) {
      composition.dataSources.forEach((dataSource) => {
        // Only register if not already registered
        if (!dataSourceRegistry.hasSource(dataSource.id)) {
          dataSourceRegistry.registerSource(dataSource);
        }
      });
    }

    // Cleanup: Unregister data sources when composition changes
    return () => {
      if (composition.dataSources) {
        composition.dataSources.forEach((dataSource) => {
          dataSourceRegistry.unregisterSource(dataSource.id);
        });
      }
    };
  }, [composition.dataSources]);

  const { layout, widgets, styles } = composition;

  return (
    <div
      className="composed-panel"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
        gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
        gap: layout.gap || 8,
        width: '100%',
        height: '100%',
        ...styles,
      }}
    >
      {widgets.map((widget) => (
        <WidgetRenderer key={widget.id} widget={widget} />
      ))}
    </div>
  );
}

/**
 * Renders a single widget instance with data binding
 */
function WidgetRenderer({ widget }: { widget: any }) {
  // Resolve data bindings
  const bindingValues = useBindingValues(widget.dataBindings);

  // Get widget definition
  const widgetDef = widgetRegistry.get(widget.widgetType);

  if (!widgetDef) {
    return (
      <div
        style={{
          gridColumn: `${widget.position.x + 1} / span ${widget.position.w}`,
          gridRow: `${widget.position.y + 1} / span ${widget.position.h}`,
          border: '1px dashed red',
          padding: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span>Unknown widget: {widget.widgetType}</span>
      </div>
    );
  }

  const Component = widgetDef.component;

  // Merge static config with resolved binding values
  const props = {
    config: widget.config,
    ...bindingValues, // Resolved data from bindings
  };

  return (
    <div
      style={{
        gridColumn: `${widget.position.x + 1} / span ${widget.position.w}`,
        gridRow: `${widget.position.y + 1} / span ${widget.position.h}`,
        overflow: 'auto',
      }}
    >
      <Component {...props} />
    </div>
  );
}

/**
 * Hook to get all available widget types for the builder UI
 */
export function useAvailableWidgets() {
  const [widgets, setWidgets] = React.useState(widgetRegistry.getAll());

  React.useEffect(() => {
    const unsubscribe = widgetRegistry.subscribe(() => {
      setWidgets(widgetRegistry.getAll());
    });
    return unsubscribe;
  }, []);

  return widgets;
}

/**
 * Hook to get all available data sources for the builder UI
 */
export function useAvailableDataSources() {
  const [sources, setSources] = React.useState(dataSourceRegistry.getAllSources());

  React.useEffect(() => {
    const unsubscribe = dataSourceRegistry.subscribe(() => {
      setSources(dataSourceRegistry.getAllSources());
    });
    return unsubscribe;
  }, []);

  return sources;
}

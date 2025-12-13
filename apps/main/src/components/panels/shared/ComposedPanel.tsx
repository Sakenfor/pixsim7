/**
 * Composed Panel
 *
 * Renders a custom panel composition with widgets and data bindings.
 * Part of Task 50 Phase 50.4 - Panel Builder/Composer
 *
 * Integrated with Task 51 data binding system for live, reactive data.
 */

import { useMemo, useEffect } from 'react';
import type { PanelComposition } from '@lib/ui/composer/panelComposer';
import { widgetRegistry } from '@lib/ui/composer/widgetRegistry';
import {
  dataSourceRegistry,
  useBindingValues,
  initializeCoreDataSources,
} from '@/lib/dataBinding';

export interface ComposedPanelProps {
  composition: PanelComposition;
}

export function ComposedPanel({ composition }: ComposedPanelProps) {
  // Initialize core data sources once on mount
  useEffect(() => {
    initializeCoreDataSources();
  }, []);

  // Register all data sources from the composition
  useEffect(() => {
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

  // Calculate grid template
  const gridStyle = useMemo(() => {
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
      gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
      gap: `${layout.gap || 8}px`,
      height: '100%',
      width: '100%',
      padding: `${layout.gap || 8}px`,
      ...styles,
    };
  }, [layout, styles]);

  return (
    <div className="h-full w-full bg-neutral-50 dark:bg-neutral-950" style={gridStyle}>
      {widgets.map((widget) => (
        <WidgetRenderer key={widget.id} widget={widget} />
      ))}
    </div>
  );
}

/**
 * Renders a single widget instance with Task 51 data binding
 */
function WidgetRenderer({ widget }: { widget: any }) {
  // Resolve all data bindings using Task 51 hooks
  const bindingValues = useBindingValues(widget.dataBindings);

  const widgetDef = widgetRegistry.get(widget.widgetType);

  if (!widgetDef) {
    return (
      <div
        style={{
          gridColumn: `${widget.position.x + 1} / span ${widget.position.w}`,
          gridRow: `${widget.position.y + 1} / span ${widget.position.h}`,
        }}
        className="flex items-center justify-center bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded"
      >
        <p className="text-sm text-red-700 dark:text-red-300">
          Unknown widget: {widget.widgetType}
        </p>
      </div>
    );
  }

  const Component = widgetDef.component;

  // Merge static config with resolved binding values
  const props = {
    config: widget.config,
    ...bindingValues, // Live data from Task 51 bindings
  };

  return (
    <div
      style={{
        gridColumn: `${widget.position.x + 1} / span ${widget.position.w}`,
        gridRow: `${widget.position.y + 1} / span ${widget.position.h}`,
      }}
    >
      <Component {...props} />
    </div>
  );
}

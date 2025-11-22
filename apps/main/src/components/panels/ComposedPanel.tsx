/**
 * Composed Panel
 *
 * Renders a custom panel composition with widgets and data bindings.
 * Part of Task 50 Phase 50.4 - Panel Builder/Composer
 */

import { useMemo } from 'react';
import type { PanelComposition } from '../../lib/widgets/panelComposer';
import { widgetRegistry } from '../../lib/widgets/widgetRegistry';

export interface ComposedPanelProps {
  composition: PanelComposition;
  data?: Record<string, any>; // Data for data sources
}

export function ComposedPanel({ composition, data = {} }: ComposedPanelProps) {
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
      {widgets.map((widget) => {
        const widgetDef = widgetRegistry.get(widget.widgetType);

        if (!widgetDef) {
          return (
            <div
              key={widget.id}
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

        // Resolve data for this widget
        let widgetData = undefined;
        if (widget.dataBindings) {
          // For now, simple implementation: use first data binding
          const firstBinding = Object.values(widget.dataBindings)[0];
          if (firstBinding && data[firstBinding.source]) {
            widgetData = data[firstBinding.source];
            // Apply path if specified
            if (firstBinding.path) {
              const pathParts = firstBinding.path.split('.');
              let current = widgetData;
              for (const part of pathParts) {
                if (current && typeof current === 'object' && part in current) {
                  current = current[part];
                } else {
                  current = undefined;
                  break;
                }
              }
              widgetData = current;
            }
          }
        }

        return (
          <div
            key={widget.id}
            style={{
              gridColumn: `${widget.position.x + 1} / span ${widget.position.w}`,
              gridRow: `${widget.position.y + 1} / span ${widget.position.h}`,
            }}
          >
            <Component config={widget.config} data={widgetData} />
          </div>
        );
      })}
    </div>
  );
}

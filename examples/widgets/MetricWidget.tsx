/**
 * Metric Widget - Example Widget
 *
 * Displays a metric value with optional label and formatting.
 * Demonstrates integration between Task 50.4 (Widgets) and Task 51 (Data Binding)
 */

import React from 'react';
import type { WidgetProps, WidgetDefinition } from '@lib/widgets';

interface MetricWidgetConfig {
  label?: string;
  unit?: string;
  format?: 'number' | 'percentage' | 'currency';
  color?: string;
  size?: 'small' | 'medium' | 'large';
}

interface MetricWidgetProps extends WidgetProps {
  config: MetricWidgetConfig;
  value?: number; // This comes from data binding
}

/**
 * Metric Widget Component
 */
export function MetricWidget({ config, value }: MetricWidgetProps) {
  const { label, unit, format = 'number', color = '#3b82f6', size = 'medium' } = config;

  const formattedValue = React.useMemo(() => {
    if (value === undefined || value === null) return 'N/A';

    switch (format) {
      case 'percentage':
        return `${(value * 100).toFixed(1)}%`;
      case 'currency':
        return `$${value.toLocaleString()}`;
      case 'number':
      default:
        return value.toLocaleString();
    }
  }, [value, format]);

  const sizeClasses = {
    small: 'text-2xl',
    medium: 'text-4xl',
    large: 'text-6xl',
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 bg-white rounded-lg shadow">
      {label && (
        <div className="text-sm font-medium text-gray-600 mb-2 uppercase tracking-wide">
          {label}
        </div>
      )}
      <div className={`font-bold ${sizeClasses[size]}`} style={{ color }}>
        {formattedValue}
        {unit && <span className="text-lg ml-1 text-gray-500">{unit}</span>}
      </div>
    </div>
  );
}

/**
 * Widget Definition for Registration
 */
export const metricWidgetDefinition: WidgetDefinition = {
  id: 'metric',
  type: 'metric',
  title: 'Metric Display',
  component: MetricWidget,
  category: 'display',

  configSchema: {
    type: 'object',
    properties: {
      label: {
        type: 'string',
        title: 'Label',
        description: 'Optional label to display above the metric',
      },
      unit: {
        type: 'string',
        title: 'Unit',
        description: 'Unit to display (e.g., "MB", "users", "req/s")',
      },
      format: {
        type: 'string',
        title: 'Format',
        description: 'How to format the number',
        enum: ['number', 'percentage', 'currency'],
        default: 'number',
      },
      color: {
        type: 'string',
        title: 'Color',
        description: 'Color of the metric value (hex code)',
        default: '#3b82f6',
      },
      size: {
        type: 'string',
        title: 'Size',
        enum: ['small', 'medium', 'large'],
        default: 'medium',
      },
    },
  },

  defaultConfig: {
    format: 'number',
    color: '#3b82f6',
    size: 'medium',
  },

  requiresData: true,
  dataSchema: {
    value: 'number', // Expects a 'value' prop bound to a number data source
  },

  minWidth: 150,
  minHeight: 100,
  defaultWidth: 200,
  defaultHeight: 150,
  resizable: true,

  icon: '📊',
  description: 'Display a single metric value with optional formatting',
  tags: ['metric', 'number', 'display', 'kpi'],
};

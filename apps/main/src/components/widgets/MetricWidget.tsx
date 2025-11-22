/**
 * Metric Widget
 *
 * Display a single metric/KPI with optional label and trend.
 * Part of Task 50 Phase 50.4 - Panel Builder/Composer
 */

import type { WidgetProps } from '../../lib/widgets/widgetRegistry';

export interface MetricWidgetConfig {
  label: string;
  value?: string | number;
  format?: 'number' | 'currency' | 'percentage' | 'text';
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color?: string;
}

export function MetricWidget({ config, data }: WidgetProps) {
  const {
    label = 'Metric',
    value: configValue,
    format = 'number',
    trend,
    trendValue,
    color = '#3b82f6',
  } = config as MetricWidgetConfig;

  // Use data if provided, otherwise use config value
  const value = data !== undefined ? data : configValue;

  const formatValue = (val: any): string => {
    if (val === undefined || val === null) return '-';

    switch (format) {
      case 'currency':
        return `$${Number(val).toLocaleString()}`;
      case 'percentage':
        return `${Number(val).toFixed(1)}%`;
      case 'number':
        return Number(val).toLocaleString();
      case 'text':
      default:
        return String(val);
    }
  };

  const trendColors = {
    up: 'text-green-500',
    down: 'text-red-500',
    neutral: 'text-neutral-500',
  };

  const trendIcons = {
    up: '↑',
    down: '↓',
    neutral: '→',
  };

  return (
    <div className="h-full w-full flex flex-col justify-center p-4 bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700">
      <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
        {label}
      </div>
      <div
        className="text-3xl font-bold mb-1"
        style={{ color }}
      >
        {formatValue(value)}
      </div>
      {trend && (
        <div className={`text-sm ${trendColors[trend]}`}>
          <span className="mr-1">{trendIcons[trend]}</span>
          {trendValue}
        </div>
      )}
    </div>
  );
}

/**
 * Text Widget
 *
 * Display static or dynamic text content.
 * Part of Task 50 Phase 50.4 - Panel Builder/Composer
 * Integrated with Task 51 data binding system.
 */

import type { WidgetProps } from '../../lib/widgets/widgetRegistry';

export interface TextWidgetConfig {
  content: string; // Static content (used if no data binding)
  align?: 'left' | 'center' | 'right';
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl';
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  color?: string;
}

export interface TextWidgetProps extends WidgetProps {
  config: TextWidgetConfig;
  content?: string; // From Task 51 data binding
  data?: any; // Legacy support
}

export function TextWidget({ config, content: boundContent, data }: TextWidgetProps) {
  const {
    content: configContent = 'Text',
    align = 'left',
    size = 'base',
    weight = 'normal',
    color,
  } = config;

  // Priority: bound content > data prop > config content
  const displayContent = boundContent !== undefined ? boundContent : (data || configContent);

  const sizeClasses = {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl',
  };

  const weightClasses = {
    normal: 'font-normal',
    medium: 'font-medium',
    semibold: 'font-semibold',
    bold: 'font-bold',
  };

  const alignClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <div
      className={`h-full w-full flex items-center ${alignClasses[align]}`}
      style={{ color }}
    >
      <p className={`${sizeClasses[size]} ${weightClasses[weight]}`}>
        {displayContent}
      </p>
    </div>
  );
}

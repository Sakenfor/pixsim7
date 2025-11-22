/**
 * Text Widget
 *
 * Display static or dynamic text content.
 * Part of Task 50 Phase 50.4 - Panel Builder/Composer
 */

import type { WidgetProps } from '../../lib/widgets/widgetRegistry';

export interface TextWidgetConfig {
  content: string;
  align?: 'left' | 'center' | 'right';
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl';
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  color?: string;
}

export function TextWidget({ config, data }: WidgetProps) {
  const {
    content = 'Text',
    align = 'left',
    size = 'base',
    weight = 'normal',
    color,
  } = config as TextWidgetConfig;

  // If data is provided, use it as content
  const displayContent = data || content;

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

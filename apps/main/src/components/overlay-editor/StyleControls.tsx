/**
 * StyleControls Component
 *
 * Controls for widget styling (size, opacity, z-index, etc.)
 */

import React from 'react';
import type { WidgetStyle, WidgetSize } from '@lib/ui/overlay';
import { Select } from '@pixsim7/shared.ui';

export interface StyleControlsProps {
  style: WidgetStyle;
  onChange: (style: WidgetStyle) => void;
}

const SIZE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'xs', label: 'Extra Small' },
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra Large' },
];

export function StyleControls({ style, onChange }: StyleControlsProps) {
  const sizeValue = typeof style.size === 'string' ? style.size : 'custom';

  return (
    <div className="space-y-3">
      {/* Size */}
      <div>
        <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
          Size
        </label>
        <Select
          value={sizeValue}
          onChange={(e) => onChange({
            ...style,
            size: e.target.value as WidgetSize,
          })}
        >
          {SIZE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
          {typeof style.size === 'number' && (
            <option value="custom">Custom ({style.size}px)</option>
          )}
        </Select>
      </div>

      {/* Opacity */}
      <div>
        <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
          Opacity: {((style.opacity ?? 1) * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={style.opacity ?? 1}
          onChange={(e) => onChange({
            ...style,
            opacity: parseFloat(e.target.value),
          })}
          className="w-full"
        />
      </div>

      {/* Z-index */}
      <div>
        <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
          Z-Index: {style.zIndex ?? 15}
        </label>
        <input
          type="range"
          min="10"
          max="20"
          step="1"
          value={style.zIndex ?? 15}
          onChange={(e) => onChange({
            ...style,
            zIndex: parseInt(e.target.value, 10),
          })}
          className="w-full"
        />
      </div>

      {/* Additional class name */}
      <div>
        <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
          Additional Classes
        </label>
        <input
          type="text"
          value={style.className ?? ''}
          onChange={(e) => onChange({
            ...style,
            className: e.target.value,
          })}
          className="w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
          placeholder="custom-class another-class"
        />
      </div>
    </div>
  );
}

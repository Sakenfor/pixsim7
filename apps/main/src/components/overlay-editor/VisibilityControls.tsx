/**
 * VisibilityControls Component
 *
 * Controls for widget visibility settings
 */

import React from 'react';
import type { VisibilityConfig, VisibilityTrigger } from '@/lib/overlay';
import { Select } from '@pixsim/shared/ui';

export interface VisibilityControlsProps {
  visibility: VisibilityConfig;
  onChange: (visibility: VisibilityConfig) => void;
}

const TRIGGERS: Array<{ value: string; label: string }> = [
  { value: 'always', label: 'Always' },
  { value: 'hover', label: 'On hover (widget)' },
  { value: 'hover-container', label: 'On hover (container)' },
  { value: 'hover-sibling', label: 'On hover (sibling)' },
  { value: 'focus', label: 'On focus' },
  { value: 'active', label: 'When active' },
];

const TRANSITIONS: Array<{ value: string; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
  { value: 'scale', label: 'Scale' },
];

export function VisibilityControls({ visibility, onChange }: VisibilityControlsProps) {
  const triggerValue = typeof visibility.trigger === 'string'
    ? visibility.trigger
    : 'custom';

  return (
    <div className="space-y-3">
      {/* Trigger */}
      <div>
        <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
          Trigger
        </label>
        <Select
          value={triggerValue}
          onChange={(e) => onChange({
            ...visibility,
            trigger: e.target.value as VisibilityTrigger,
          })}
        >
          {TRIGGERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Transition */}
      <div>
        <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
          Transition
        </label>
        <Select
          value={visibility.transition ?? 'none'}
          onChange={(e) => onChange({
            ...visibility,
            transition: e.target.value as VisibilityConfig['transition'],
          })}
        >
          {TRANSITIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Delay */}
      <div>
        <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
          Delay (ms): {visibility.delay ?? 0}
        </label>
        <input
          type="range"
          min="0"
          max="1000"
          step="50"
          value={visibility.delay ?? 0}
          onChange={(e) => onChange({
            ...visibility,
            delay: parseInt(e.target.value, 10),
          })}
          className="w-full"
        />
      </div>

      {/* Transition duration */}
      {visibility.transition && visibility.transition !== 'none' && (
        <div>
          <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
            Duration (ms): {visibility.transitionDuration ?? 250}
          </label>
          <input
            type="range"
            min="100"
            max="1000"
            step="50"
            value={visibility.transitionDuration ?? 250}
            onChange={(e) => onChange({
              ...visibility,
              transitionDuration: parseInt(e.target.value, 10),
            })}
            className="w-full"
          />
        </div>
      )}

      {/* Reduce motion */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={visibility.reduceMotion ?? false}
          onChange={(e) => onChange({
            ...visibility,
            reduceMotion: e.target.checked,
          })}
          className="rounded"
        />
        Respect reduced motion preference
      </label>
    </div>
  );
}

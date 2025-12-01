/**
 * TypeSpecificProperties Component
 *
 * Renders type-specific property editors for different widget types
 */

import React from 'react';
import type { OverlayWidget } from '@/lib/overlay';

export interface TypeSpecificPropertiesProps {
  widget: OverlayWidget;
  onUpdate: (updates: Partial<OverlayWidget>) => void;
}

/**
 * Badge widget specific properties
 */
function BadgeProperties({ widget, onUpdate }: TypeSpecificPropertiesProps) {
  const widgetAny = widget as any;

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Variant</span>
        <select
          value={widgetAny.variant || 'icon'}
          onChange={(e) => onUpdate({ ...widget, variant: e.target.value })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
        >
          <option value="icon">Icon Only</option>
          <option value="text">Text Only</option>
          <option value="icon-text">Icon + Text</option>
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Icon</span>
        <input
          type="text"
          value={widgetAny.icon || ''}
          onChange={(e) => onUpdate({ ...widget, icon: e.target.value })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
          placeholder="Icon name"
        />
      </label>

      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Color</span>
        <select
          value={widgetAny.color || 'gray'}
          onChange={(e) => onUpdate({ ...widget, color: e.target.value })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
        >
          <option value="gray">Gray</option>
          <option value="blue">Blue</option>
          <option value="green">Green</option>
          <option value="red">Red</option>
          <option value="purple">Purple</option>
          <option value="pink">Pink</option>
          <option value="orange">Orange</option>
          <option value="yellow">Yellow</option>
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Shape</span>
        <select
          value={widgetAny.shape || 'rounded'}
          onChange={(e) => onUpdate({ ...widget, shape: e.target.value })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
        >
          <option value="circle">Circle</option>
          <option value="square">Square</option>
          <option value="rounded">Rounded</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={widgetAny.pulse ?? false}
          onChange={(e) => onUpdate({ ...widget, pulse: e.target.checked })}
          className="rounded"
        />
        Pulse Animation
      </label>
    </div>
  );
}

/**
 * Panel widget specific properties
 */
function PanelProperties({ widget, onUpdate }: TypeSpecificPropertiesProps) {
  const widgetAny = widget as any;

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Variant</span>
        <select
          value={widgetAny.variant || 'default'}
          onChange={(e) => onUpdate({ ...widget, variant: e.target.value })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
        >
          <option value="default">Default</option>
          <option value="dark">Dark</option>
          <option value="glass">Glass</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={widgetAny.backdrop ?? false}
          onChange={(e) => onUpdate({ ...widget, backdrop: e.target.checked })}
          className="rounded"
        />
        Enable Backdrop
      </label>
    </div>
  );
}

/**
 * Upload widget specific properties
 */
function UploadProperties({ widget, onUpdate }: TypeSpecificPropertiesProps) {
  const widgetAny = widget as any;

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Variant</span>
        <select
          value={widgetAny.variant || 'secondary'}
          onChange={(e) => onUpdate({ ...widget, variant: e.target.value })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
        >
          <option value="primary">Primary</option>
          <option value="secondary">Secondary</option>
          <option value="ghost">Ghost</option>
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Size</span>
        <select
          value={widgetAny.size || 'sm'}
          onChange={(e) => onUpdate({ ...widget, size: e.target.value })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
        >
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={widgetAny.showProgress ?? true}
          onChange={(e) => onUpdate({ ...widget, showProgress: e.target.checked })}
          className="rounded"
        />
        Show Progress Bar
      </label>
    </div>
  );
}

/**
 * Button widget specific properties
 */
function ButtonProperties({ widget, onUpdate }: TypeSpecificPropertiesProps) {
  const widgetAny = widget as any;

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Icon</span>
        <input
          type="text"
          value={widgetAny.icon || ''}
          onChange={(e) => onUpdate({ ...widget, icon: e.target.value })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
          placeholder="Icon name"
        />
      </label>

      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Variant</span>
        <select
          value={widgetAny.variant || 'secondary'}
          onChange={(e) => onUpdate({ ...widget, variant: e.target.value })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
        >
          <option value="primary">Primary</option>
          <option value="secondary">Secondary</option>
          <option value="ghost">Ghost</option>
          <option value="danger">Danger</option>
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Size</span>
        <select
          value={widgetAny.size || 'md'}
          onChange={(e) => onUpdate({ ...widget, size: e.target.value })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
        >
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={widgetAny.disabled ?? false}
          onChange={(e) => onUpdate({ ...widget, disabled: e.target.checked })}
          className="rounded"
        />
        Disabled
      </label>
    </div>
  );
}

/**
 * Main type-specific properties component that routes to the appropriate editor
 */
export function TypeSpecificProperties({ widget, onUpdate }: TypeSpecificPropertiesProps) {
  switch (widget.type) {
    case 'badge':
      return <BadgeProperties widget={widget} onUpdate={onUpdate} />;
    case 'panel':
      return <PanelProperties widget={widget} onUpdate={onUpdate} />;
    case 'upload':
      return <UploadProperties widget={widget} onUpdate={onUpdate} />;
    case 'button':
      return <ButtonProperties widget={widget} onUpdate={onUpdate} />;
    default:
      return (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          No type-specific properties available for {widget.type}
        </p>
      );
  }
}

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
 * Menu widget specific properties
 */
function MenuProperties({ widget, onUpdate }: TypeSpecificPropertiesProps) {
  const widgetAny = widget as any;

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Trigger Type</span>
        <select
          value={widgetAny.triggerType || 'click'}
          onChange={(e) => onUpdate({ ...widget, triggerType: e.target.value })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
        >
          <option value="click">Click</option>
          <option value="hover">Hover</option>
          <option value="contextmenu">Context Menu</option>
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Placement</span>
        <select
          value={widgetAny.placement || 'bottom-right'}
          onChange={(e) => onUpdate({ ...widget, placement: e.target.value })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
        >
          <option value="bottom-left">Bottom Left</option>
          <option value="bottom-right">Bottom Right</option>
          <option value="top-left">Top Left</option>
          <option value="top-right">Top Right</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={widgetAny.closeOnClick !== false}
          onChange={(e) => onUpdate({ ...widget, closeOnClick: e.target.checked })}
          className="rounded"
        />
        Close on Click
      </label>

      <p className="text-xs text-neutral-500 dark:text-neutral-400 italic">
        Menu items must be configured in code
      </p>
    </div>
  );
}

/**
 * Tooltip widget specific properties
 */
function TooltipProperties({ widget, onUpdate }: TypeSpecificPropertiesProps) {
  const widgetAny = widget as any;

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Placement</span>
        <select
          value={widgetAny.placement || 'auto'}
          onChange={(e) => onUpdate({ ...widget, placement: e.target.value })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
        >
          <option value="auto">Auto</option>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Delay (ms)</span>
        <input
          type="number"
          value={widgetAny.delay ?? 300}
          onChange={(e) => onUpdate({ ...widget, delay: parseInt(e.target.value, 10) })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
          min="0"
          step="50"
        />
      </label>

      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Max Width (px)</span>
        <input
          type="number"
          value={widgetAny.maxWidth ?? 280}
          onChange={(e) => onUpdate({ ...widget, maxWidth: parseInt(e.target.value, 10) })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
          min="100"
          step="10"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={widgetAny.showArrow !== false}
          onChange={(e) => onUpdate({ ...widget, showArrow: e.target.checked })}
          className="rounded"
        />
        Show Arrow
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={widgetAny.rich !== false}
          onChange={(e) => onUpdate({ ...widget, rich: e.target.checked })}
          className="rounded"
        />
        Rich Formatting
      </label>
    </div>
  );
}

/**
 * Video scrub widget specific properties
 */
function VideoScrubProperties({ widget, onUpdate }: TypeSpecificPropertiesProps) {
  const widgetAny = widget as any;

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Timeline Position</span>
        <select
          value={widgetAny.timelinePosition || 'bottom'}
          onChange={(e) => onUpdate({ ...widget, timelinePosition: e.target.value })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
        >
          <option value="bottom">Bottom</option>
          <option value="top">Top</option>
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Throttle (ms)</span>
        <input
          type="number"
          value={widgetAny.throttle ?? 50}
          onChange={(e) => onUpdate({ ...widget, throttle: parseInt(e.target.value, 10) })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
          min="0"
          step="10"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={widgetAny.showTimeline !== false}
          onChange={(e) => onUpdate({ ...widget, showTimeline: e.target.checked })}
          className="rounded"
        />
        Show Timeline
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={widgetAny.showTimestamp !== false}
          onChange={(e) => onUpdate({ ...widget, showTimestamp: e.target.checked })}
          className="rounded"
        />
        Show Timestamp
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={widgetAny.frameAccurate ?? false}
          onChange={(e) => onUpdate({ ...widget, frameAccurate: e.target.checked })}
          className="rounded"
        />
        Frame Accurate (slower)
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={widgetAny.muted !== false}
          onChange={(e) => onUpdate({ ...widget, muted: e.target.checked })}
          className="rounded"
        />
        Muted
      </label>
    </div>
  );
}

/**
 * Progress widget specific properties
 */
function ProgressProperties({ widget, onUpdate }: TypeSpecificPropertiesProps) {
  const widgetAny = widget as any;

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Variant</span>
        <select
          value={widgetAny.variant || 'bar'}
          onChange={(e) => onUpdate({ ...widget, variant: e.target.value })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
        >
          <option value="bar">Bar</option>
          <option value="circular">Circular</option>
          <option value="line">Line</option>
        </select>
      </label>

      {widgetAny.variant === 'bar' && (
        <label className="block text-sm">
          <span className="text-neutral-600 dark:text-neutral-400 text-xs">Orientation</span>
          <select
            value={widgetAny.orientation || 'horizontal'}
            onChange={(e) => onUpdate({ ...widget, orientation: e.target.value })}
            className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
        </label>
      )}

      {widgetAny.variant === 'circular' && (
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
      )}

      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Color</span>
        <select
          value={widgetAny.color || 'blue'}
          onChange={(e) => onUpdate({ ...widget, color: e.target.value })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
        >
          <option value="blue">Blue</option>
          <option value="green">Green</option>
          <option value="red">Red</option>
          <option value="purple">Purple</option>
          <option value="orange">Orange</option>
          <option value="gray">Gray</option>
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">State</span>
        <select
          value={widgetAny.state || 'normal'}
          onChange={(e) => onUpdate({ ...widget, state: e.target.value })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
        >
          <option value="normal">Normal</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-neutral-600 dark:text-neutral-400 text-xs">Max Value</span>
        <input
          type="number"
          value={widgetAny.max ?? 100}
          onChange={(e) => onUpdate({ ...widget, max: parseInt(e.target.value, 10) })}
          className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
          min="1"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={widgetAny.showLabel ?? false}
          onChange={(e) => onUpdate({ ...widget, showLabel: e.target.checked })}
          className="rounded"
        />
        Show Label
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={widgetAny.animated ?? false}
          onChange={(e) => onUpdate({ ...widget, animated: e.target.checked })}
          className="rounded"
        />
        Animated
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
    case 'menu':
      return <MenuProperties widget={widget} onUpdate={onUpdate} />;
    case 'tooltip':
      return <TooltipProperties widget={widget} onUpdate={onUpdate} />;
    case 'video-scrub':
      return <VideoScrubProperties widget={widget} onUpdate={onUpdate} />;
    case 'progress':
      return <ProgressProperties widget={widget} onUpdate={onUpdate} />;
    default:
      return (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          No type-specific properties available for {widget.type}
        </p>
      );
  }
}

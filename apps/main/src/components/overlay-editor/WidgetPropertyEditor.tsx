/**
 * WidgetPropertyEditor Component
 *
 * Edits properties of a selected overlay widget
 */

import React from 'react';
import type { OverlayWidget } from '@/lib/overlay';
import { Panel } from '@pixsim/shared/ui';
import { PositionControls } from './PositionControls';
import { VisibilityControls } from './VisibilityControls';
import { StyleControls } from './StyleControls';

export interface WidgetPropertyEditorProps {
  widget: OverlayWidget;
  onUpdate: (updates: Partial<OverlayWidget>) => void;
}

export function WidgetPropertyEditor({ widget, onUpdate }: WidgetPropertyEditorProps) {
  return (
    <Panel className="space-y-4">
      {/* Widget header */}
      <div className="border-b border-neutral-200 dark:border-neutral-700 pb-3">
        <h3 className="text-sm font-semibold mb-1">{widget.id}</h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Type: {widget.type}</p>
      </div>

      {/* Position controls */}
      <div>
        <h4 className="text-sm font-medium mb-2">Position</h4>
        <PositionControls
          position={widget.position}
          onChange={(position) => onUpdate({ position })}
        />
      </div>

      {/* Visibility controls */}
      <div>
        <h4 className="text-sm font-medium mb-2">Visibility</h4>
        <VisibilityControls
          visibility={widget.visibility}
          onChange={(visibility) => onUpdate({ visibility })}
        />
      </div>

      {/* Style controls */}
      {widget.style && (
        <div>
          <h4 className="text-sm font-medium mb-2">Style</h4>
          <StyleControls
            style={widget.style}
            onChange={(style) => onUpdate({ style })}
          />
        </div>
      )}

      {/* Additional properties */}
      <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3 space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={widget.interactive ?? false}
            onChange={(e) => onUpdate({ interactive: e.target.checked })}
            className="rounded"
          />
          Interactive
        </label>

        {widget.interactive && (
          <div className="pl-6 space-y-2">
            <label className="block text-sm">
              <span className="text-neutral-600 dark:text-neutral-400 text-xs">ARIA Label</span>
              <input
                type="text"
                value={widget.ariaLabel ?? ''}
                onChange={(e) => onUpdate({ ariaLabel: e.target.value })}
                className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
                placeholder="Accessible label"
              />
            </label>

            <label className="block text-sm">
              <span className="text-neutral-600 dark:text-neutral-400 text-xs">Tab Index</span>
              <input
                type="number"
                value={widget.tabIndex ?? 0}
                onChange={(e) => onUpdate({ tabIndex: parseInt(e.target.value, 10) })}
                className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
                min="-1"
              />
            </label>
          </div>
        )}

        <label className="block text-sm">
          <span className="text-neutral-600 dark:text-neutral-400 text-xs">Priority (z-index order)</span>
          <input
            type="number"
            value={widget.priority ?? 0}
            onChange={(e) => onUpdate({ priority: parseInt(e.target.value, 10) })}
            className="mt-1 block w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
          />
        </label>
      </div>
    </Panel>
  );
}

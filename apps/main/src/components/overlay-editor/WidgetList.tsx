/**
 * WidgetList Component
 *
 * Displays list of overlay widgets with add/remove/reorder capabilities
 */

import React, { useState } from 'react';
import type { OverlayWidget } from '@/lib/overlay';
import { Panel, Button } from '@pixsim7/shared.ui';
import { Icon } from '@/components/common/Icon';

export interface WidgetListProps {
  widgets: OverlayWidget[];
  selectedWidgetId: string | null;
  onSelectWidget: (widgetId: string) => void;
  onRemoveWidget: (widgetId: string) => void;
  onReorderWidgets: (newOrder: OverlayWidget[]) => void;
  onAddWidget: (widgetType: string) => void;
  availableWidgetTypes: Array<{
    type: string;
    name: string;
    icon?: string;
  }>;
}

export function WidgetList({
  widgets,
  selectedWidgetId,
  onSelectWidget,
  onRemoveWidget,
  onReorderWidgets,
  onAddWidget,
  availableWidgetTypes,
}: WidgetListProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Move widget up in list
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...widgets];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    onReorderWidgets(newOrder);
  };

  // Move widget down in list
  const handleMoveDown = (index: number) => {
    if (index === widgets.length - 1) return;
    const newOrder = [...widgets];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    onReorderWidgets(newOrder);
  };

  return (
    <Panel className="flex flex-col gap-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Widgets</h3>
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAddMenu(!showAddMenu)}
          >
            <Icon name="plus" className="w-4 h-4" />
          </Button>

          {showAddMenu && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg min-w-[160px]">
              {availableWidgetTypes.length > 0 ? (
                availableWidgetTypes.map((type) => (
                  <button
                    key={type.type}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
                    onClick={() => {
                      onAddWidget(type.type);
                      setShowAddMenu(false);
                    }}
                  >
                    {type.icon && <Icon name={type.icon} className="w-4 h-4" />}
                    <span>{type.name}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-neutral-500">
                  No widget types available
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Widget list */}
      <div className="space-y-1">
        {widgets.length === 0 ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-8">
            No widgets. Click + to add one.
          </div>
        ) : (
          widgets.map((widget, index) => (
            <div
              key={widget.id}
              className={`
                flex items-center gap-2 p-2 rounded
                cursor-pointer transition-colors
                ${
                  selectedWidgetId === widget.id
                    ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
                    : 'bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                }
              `}
              onClick={() => onSelectWidget(widget.id)}
            >
              {/* Widget info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{widget.id}</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {widget.type}
                </div>
              </div>

              {/* Reorder buttons */}
              <div className="flex gap-1">
                <button
                  className="p-1 hover:bg-white/50 dark:hover:bg-black/20 rounded disabled:opacity-30"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveUp(index);
                  }}
                  disabled={index === 0}
                  title="Move up"
                >
                  <Icon name="chevronUp" className="w-3 h-3" />
                </button>
                <button
                  className="p-1 hover:bg-white/50 dark:hover:bg-black/20 rounded disabled:opacity-30"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveDown(index);
                  }}
                  disabled={index === widgets.length - 1}
                  title="Move down"
                >
                  <Icon name="chevronDown" className="w-3 h-3" />
                </button>
                <button
                  className="p-1 hover:bg-red-500 hover:text-white rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveWidget(widget.id);
                  }}
                  title="Remove"
                >
                  <Icon name="trash" className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

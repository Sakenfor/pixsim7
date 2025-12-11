/**
 * World Tools Panel
 *
 * Renders world tool plugins in a side panel for Game2D.
 * Automatically discovers and displays tools based on their visibility predicates.
 * Replaces hard-coded tool panels like RelationshipDashboard, QuestLog, etc.
 */

import { useEffect, useState } from 'react';
import { Panel, Button } from '@pixsim7/shared.ui';
import type { WorldToolContext, WorldToolPlugin } from '../lib/types';

interface WorldToolsPanelProps {
  context: WorldToolContext;
  tools: WorldToolPlugin[];
}

/**
 * World tools panel component
 * Shows a toolbar of available tools and renders the active tool
 */
export function WorldToolsPanel({ context, tools }: WorldToolsPanelProps) {
  const [activeTool, setActiveTool] = useState<string | null>(null);

  // Auto-deselect tool if it becomes invisible
  useEffect(() => {
    if (activeTool && !tools.find(t => t.id === activeTool)) {
      setActiveTool(null);
    }
  }, [tools, activeTool]);

  const activeToolData = tools.find(t => t.id === activeTool);

  if (tools.length === 0) {
    return null; // Don't show anything if no tools available
  }

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        {tools.map(tool => (
          <Button
            key={tool.id}
            size="sm"
            variant={activeTool === tool.id ? "primary" : "secondary"}
            onClick={() => setActiveTool(activeTool === tool.id ? null : tool.id)}
            title={tool.description}
          >
            {tool.icon && <span className="mr-1">{tool.icon}</span>}
            {tool.name}
          </Button>
        ))}
      </div>

      {/* Active Tool Panel */}
      {activeToolData && (
        <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {activeToolData.icon && <span className="text-xl">{activeToolData.icon}</span>}
              <div>
                <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
                  {activeToolData.name}
                </h2>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  {activeToolData.description}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setActiveTool(null)}
              aria-label="Close tool"
            >
              ✕
            </Button>
          </div>
          <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3">
            {activeToolData.render(context)}
          </div>
        </Panel>
      )}
    </div>
  );
}

/**
 * Compact world tools panel (for floating panels or modal views)
 */
export function CompactWorldToolsPanel({ context, tools }: WorldToolsPanelProps) {
  const [selectedTool, setSelectedTool] = useState<string | null>(null);

  useEffect(() => {
    // Auto-select first tool if none selected
    if (tools.length > 0 && !selectedTool) {
      setSelectedTool(tools[0].id);
    }
    // Deselect if tool becomes invisible
    if (selectedTool && !tools.find(t => t.id === selectedTool)) {
      setSelectedTool(tools.length > 0 ? tools[0].id : null);
    }
  }, [tools, selectedTool]);

  const activeTool = tools.find(t => t.id === selectedTool);

  if (tools.length === 0) {
    return (
      <div className="p-3 text-sm text-neutral-500 dark:text-neutral-400">
        No world tools available
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tool Tabs */}
      <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-700 p-2 flex-wrap">
        {tools.map(tool => (
          <button
            key={tool.id}
            onClick={() => setSelectedTool(tool.id)}
            className={`px-3 py-2 text-xs rounded transition-colors ${
              selectedTool === tool.id
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
            title={tool.description}
          >
            {tool.icon && <span className="mr-1">{tool.icon}</span>}
            {tool.name}
          </button>
        ))}
      </div>

      {/* Tool Content */}
      <div className="flex-1 overflow-auto p-3">
        {activeTool && activeTool.render(context)}
      </div>
    </div>
  );
}

/**
 * Grid-based world tools panel (shows multiple tools at once)
 */
export function GridWorldToolsPanel({ context, tools }: WorldToolsPanelProps) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const toggleTool = (toolId: string) => {
    const newExpanded = new Set(expandedTools);
    if (newExpanded.has(toolId)) {
      newExpanded.delete(toolId);
    } else {
      newExpanded.add(toolId);
    }
    setExpandedTools(newExpanded);
  };

  if (tools.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
        World Tools
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {tools.map(tool => {
          const isExpanded = expandedTools.has(tool.id);

          return (
            <div
              key={tool.id}
              className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden"
            >
              {/* Tool Header */}
              <button
                onClick={() => toggleTool(tool.id)}
                className="w-full px-4 py-3 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  {tool.icon && <span className="text-xl">{tool.icon}</span>}
                  <div className="text-left">
                    <div className="font-semibold text-sm text-neutral-800 dark:text-neutral-200">
                      {tool.name}
                    </div>
                    <div className="text-xs text-neutral-600 dark:text-neutral-400">
                      {tool.description}
                    </div>
                  </div>
                </div>
                <span className="text-neutral-500 dark:text-neutral-400">
                  {isExpanded ? '▼' : '▶'}
                </span>
              </button>

              {/* Tool Content */}
              {isExpanded && (
                <div className="p-3 bg-white dark:bg-neutral-900">
                  {tool.render(context)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

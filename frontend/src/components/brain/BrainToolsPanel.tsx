/**
 * Brain Tools Panel
 *
 * Renders brain tool plugins for NPC Brain Lab.
 * Automatically discovers and displays tools based on their visibility predicates.
 * Replaces hard-coded inspector panels.
 */

import { useEffect, useState } from 'react';
import { Panel, Button } from '@pixsim7/ui';
import type { BrainToolContext, BrainToolPlugin } from '../../lib/brainTools/types';

interface BrainToolsPanelProps {
  context: BrainToolContext;
  tools: BrainToolPlugin[];
}

/**
 * Brain tools panel component
 * Shows a toolbar of available tools and renders the active tool
 */
export function BrainToolsPanel({ context, tools }: BrainToolsPanelProps) {
  const [activeTool, setActiveTool] = useState<string | null>(null);

  // Auto-select first tool if none selected
  useEffect(() => {
    if (tools.length > 0 && !activeTool) {
      setActiveTool(tools[0].id);
    }
  }, [tools.length]);

  // Auto-deselect tool if it becomes invisible
  useEffect(() => {
    if (activeTool && !tools.find(t => t.id === activeTool)) {
      setActiveTool(tools.length > 0 ? tools[0].id : null);
    }
  }, [tools, activeTool]);

  // Handle tool mount/unmount lifecycle
  useEffect(() => {
    if (!activeTool) return;

    const tool = tools.find(t => t.id === activeTool);
    if (!tool) return;

    // Call onMount if defined
    if (tool.onMount) {
      Promise.resolve(tool.onMount(context)).catch(err => {
        console.error(`Error mounting tool ${tool.id}:`, err);
      });
    }

    // Return cleanup function
    return () => {
      if (tool.onUnmount) {
        Promise.resolve(tool.onUnmount()).catch(err => {
          console.error(`Error unmounting tool ${tool.id}:`, err);
        });
      }
    };
  }, [activeTool, context]);

  const activeToolData = tools.find(t => t.id === activeTool);

  if (tools.length === 0) {
    return (
      <Panel className="p-8 text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No brain tools available
        </p>
      </Panel>
    );
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
            onClick={() => setActiveTool(tool.id)}
            title={tool.description}
          >
            {tool.icon && <span className="mr-1">{tool.icon}</span>}
            {tool.name}
          </Button>
        ))}
      </div>

      {/* Active Tool Panel */}
      {activeToolData && (
        <Panel className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {activeToolData.icon && <span className="text-xl">{activeToolData.icon}</span>}
              <div>
                <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
                  {activeToolData.name}
                </h2>
                {activeToolData.description && (
                  <p className="text-xs text-neutral-600 dark:text-neutral-400">
                    {activeToolData.description}
                  </p>
                )}
              </div>
            </div>
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
 * Compact brain tools panel (for tab-based views)
 */
export function CompactBrainToolsPanel({ context, tools }: BrainToolsPanelProps) {
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

  // Handle tool mount/unmount lifecycle
  useEffect(() => {
    if (!selectedTool) return;

    const tool = tools.find(t => t.id === selectedTool);
    if (!tool) return;

    // Call onMount if defined
    if (tool.onMount) {
      Promise.resolve(tool.onMount(context)).catch(err => {
        console.error(`Error mounting tool ${tool.id}:`, err);
      });
    }

    // Return cleanup function
    return () => {
      if (tool.onUnmount) {
        Promise.resolve(tool.onUnmount()).catch(err => {
          console.error(`Error unmounting tool ${tool.id}:`, err);
        });
      }
    };
  }, [selectedTool, context]);

  const activeTool = tools.find(t => t.id === selectedTool);

  if (tools.length === 0) {
    return (
      <div className="p-3 text-sm text-neutral-500 dark:text-neutral-400">
        No brain tools available
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

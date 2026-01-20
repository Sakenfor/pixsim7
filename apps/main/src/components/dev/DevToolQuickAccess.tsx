/**
 * Dev Tool Quick Access Modal
 *
 * Quick access modal for opening dev tools with keyboard navigation.
 * Triggered by Ctrl+Shift+D.
 */

import type { DevToolDefinition } from '@pixsim7/shared.devtools';
import { useState, useMemo, useEffect, useRef } from 'react';

import { useDevToolContext } from '@lib/dev/devtools/devToolContext';
import { devToolSelectors } from '@lib/plugins/catalogSelectors';

import { useWorkspaceStore } from '@features/workspace';

export function DevToolQuickAccess() {
  const { isQuickAccessOpen, closeQuickAccess, addRecentTool, recentTools } = useDevToolContext();
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get all tools
  const allTools = useMemo(() => devToolSelectors.getAll(), []);

  // Filter and sort tools
  const filteredTools = useMemo(() => {
    if (!searchQuery.trim()) {
      // Show recent tools first when no search query
      const recentToolDefs = recentTools
        .map((id) => devToolSelectors.get(id))
        .filter((tool): tool is DevToolDefinition => tool !== undefined);

      const otherTools = allTools.filter((tool) => !recentTools.includes(tool.id));

      return [...recentToolDefs, ...otherTools];
    }

    // Search tools
    return devToolSelectors.search(searchQuery);
  }, [allTools, searchQuery, recentTools]);

  // Reset selection when filtered tools change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredTools]);

  // Focus input when modal opens
  useEffect(() => {
    if (isQuickAccessOpen) {
      setSearchQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isQuickAccessOpen]);

  const handleOpenTool = (tool: DevToolDefinition) => {
    addRecentTool(tool.id);
    closeQuickAccess();

    if (tool.routePath) {
      window.location.href = tool.routePath;
    } else if (tool.panelComponent) {
      const panelId = `dev-tool:${tool.id}` as any;
      openFloatingPanel(panelId, {
        width: 800,
        height: 600,
        context: {
          toolId: tool.id,
          toolDefinition: tool,
        },
      });
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredTools.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        event.preventDefault();
        if (filteredTools[selectedIndex]) {
          handleOpenTool(filteredTools[selectedIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        closeQuickAccess();
        break;
    }
  };

  if (!isQuickAccessOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm"
      onClick={closeQuickAccess}
    >
      <div
        className="w-full max-w-2xl bg-gray-900 rounded-lg shadow-2xl border border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="p-4 border-b border-gray-700">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search dev tools... (↑↓ to navigate, Enter to open, Esc to close)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {filteredTools.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>No dev tools found</p>
              {searchQuery && (
                <p className="text-sm mt-2">Try a different search query</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {filteredTools.map((tool, index) => {
                const isSelected = index === selectedIndex;
                const isRecent = recentTools.includes(tool.id);

                return (
                  <button
                    key={tool.id}
                    onClick={() => handleOpenTool(tool)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full text-left p-4 transition-colors ${
                      isSelected
                        ? 'bg-blue-900/30 border-l-4 border-blue-500'
                        : 'hover:bg-gray-800 border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      {tool.icon && (
                        <div className="text-2xl flex-shrink-0">{tool.icon}</div>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-gray-100">{tool.label}</div>
                          {isRecent && (
                            <span className="px-1.5 py-0.5 text-xs bg-gray-700 text-gray-300 rounded">
                              Recent
                            </span>
                          )}
                          {tool.category && (
                            <span className="px-1.5 py-0.5 text-xs bg-gray-800 text-gray-400 rounded">
                              {tool.category}
                            </span>
                          )}
                        </div>
                        {tool.description && (
                          <div className="text-sm text-gray-400 mt-1">
                            {tool.description}
                          </div>
                        )}
                      </div>

                      {/* Action indicator */}
                      <div className="flex-shrink-0 text-gray-500">
                        {tool.routePath ? '→' : '⤢'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 flex items-center justify-between text-xs text-gray-400">
          <div>
            {filteredTools.length} tool{filteredTools.length !== 1 ? 's' : ''}
          </div>
          <div className="flex gap-4">
            <span><kbd className="px-1.5 py-0.5 bg-gray-700 rounded">↑↓</kbd> Navigate</span>
            <span><kbd className="px-1.5 py-0.5 bg-gray-700 rounded">Enter</kbd> Open</span>
            <span><kbd className="px-1.5 py-0.5 bg-gray-700 rounded">Esc</kbd> Close</span>
          </div>
        </div>
      </div>
    </div>
  );
}

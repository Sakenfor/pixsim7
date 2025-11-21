/**
 * Session Flags Inspector World Tool Plugin
 *
 * Displays and allows inspection of all session flags in a structured view.
 */

import { useState } from 'react';
import type { WorldToolPlugin } from '../../lib/worldTools/types';
import { Badge } from '@pixsim7/shared.ui';

export const sessionFlagsDebugTool: WorldToolPlugin = {
  id: 'session-flags-debug',
  name: 'Session Flags',
  description: 'Inspect session flags and state',
  icon: '🏴',
  category: 'debug',

  // Show when we have a session
  whenVisible: (context) => context.session !== null,

  render: (context) => {
    const { session, sessionFlags } = context;

    if (!session) {
      return (
        <div className="text-sm text-neutral-500">
          No active game session
        </div>
      );
    }

    return <SessionFlagsInspector flags={sessionFlags} />;
  },
};

interface SessionFlagsInspectorProps {
  flags: Record<string, unknown>;
}

function SessionFlagsInspector({ flags }: SessionFlagsInspectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['']));

  const togglePath = (path: string) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  };

  const renderValue = (value: unknown, path: string, key: string): JSX.Element => {
    const fullPath = path ? `${path}.${key}` : key;

    if (value === null) {
      return <span className="text-neutral-400">null</span>;
    }

    if (value === undefined) {
      return <span className="text-neutral-400">undefined</span>;
    }

    if (typeof value === 'boolean') {
      return <span className="text-purple-600 dark:text-purple-400">{String(value)}</span>;
    }

    if (typeof value === 'number') {
      return <span className="text-blue-600 dark:text-blue-400">{value}</span>;
    }

    if (typeof value === 'string') {
      return <span className="text-green-600 dark:text-green-400">"{value}"</span>;
    }

    if (Array.isArray(value)) {
      const isExpanded = expandedPaths.has(fullPath);
      return (
        <div>
          <button
            onClick={() => togglePath(fullPath)}
            className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            {isExpanded ? '▼' : '▶'} Array[{value.length}]
          </button>
          {isExpanded && (
            <div className="ml-4 border-l-2 border-neutral-200 dark:border-neutral-700 pl-3 mt-1">
              {value.map((item, idx) => (
                <div key={idx} className="py-1">
                  <span className="text-neutral-500 text-xs">[{idx}]:</span>{' '}
                  {renderValue(item, fullPath, String(idx))}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (typeof value === 'object') {
      const isExpanded = expandedPaths.has(fullPath);
      const entries = Object.entries(value as Record<string, unknown>);

      return (
        <div>
          <button
            onClick={() => togglePath(fullPath)}
            className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            {isExpanded ? '▼' : '▶'} Object ({entries.length} keys)
          </button>
          {isExpanded && (
            <div className="ml-4 border-l-2 border-neutral-200 dark:border-neutral-700 pl-3 mt-1">
              {entries.map(([k, v]) => (
                <div key={k} className="py-1">
                  <span className="font-mono text-xs text-neutral-700 dark:text-neutral-300">
                    {k}:
                  </span>{' '}
                  {renderValue(v, fullPath, k)}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return <span className="text-neutral-500">{String(value)}</span>;
  };

  // Filter flags by search term
  const filteredEntries = Object.entries(flags).filter(([key]) => {
    if (!searchTerm) return true;
    return key.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-3">
      {/* Search */}
      <div>
        <input
          type="text"
          placeholder="Search flags..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
        />
      </div>

      {/* Stats */}
      <div className="flex gap-2 text-xs">
        <Badge color="blue">
          {Object.keys(flags).length} top-level keys
        </Badge>
        {searchTerm && (
          <Badge color="green">
            {filteredEntries.length} matches
          </Badge>
        )}
      </div>

      {/* Flags Tree */}
      <div className="space-y-2 max-h-96 overflow-y-auto bg-neutral-50 dark:bg-neutral-900 p-3 rounded border border-neutral-200 dark:border-neutral-700 font-mono text-xs">
        {filteredEntries.length === 0 ? (
          <div className="text-neutral-500">No flags match your search</div>
        ) : (
          filteredEntries.map(([key, value]) => (
            <div key={key} className="py-1">
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                {key}:
              </span>{' '}
              {renderValue(value, '', key)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

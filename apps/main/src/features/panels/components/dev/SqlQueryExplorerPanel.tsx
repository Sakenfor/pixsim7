/**
 * SQL Query Explorer Panel
 *
 * Interactive dev tool for running read-only SQL queries against the database.
 * Supports preset queries and custom SQL input.
 */

import { useState, useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import { Icon } from '@lib/icons';

// ============================================================================
// Types
// ============================================================================

interface PresetQuery {
  id: string;
  name: string;
  description: string;
  category: string;
  sql: string;
}

interface QueryResult {
  columns: string[];
  rows: any[][];
  row_count: number;
  truncated: boolean;
  execution_time_ms: number;
  query: string;
}

// ============================================================================
// Component
// ============================================================================

export function SqlQueryExplorerPanel() {
  const api = useApi();

  // State
  const [presets, setPresets] = useState<PresetQuery[]>([]);
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const [sql, setSql] = useState('SELECT id, operation_type, status, created_at\nFROM generations\nORDER BY created_at DESC\nLIMIT 20;');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxRows, setMaxRows] = useState(100);

  // Load presets on mount
  const loadPresets = useCallback(async () => {
    if (presetsLoaded) return;
    try {
      const data = await api.get('/dev/sql/presets');
      setPresets(data);
      setPresetsLoaded(true);
    } catch (err) {
      console.error('Failed to load presets:', err);
    }
  }, [api, presetsLoaded]);

  // Load presets on first render
  if (!presetsLoaded) {
    loadPresets();
  }

  // Execute query
  const executeQuery = useCallback(async () => {
    if (!sql.trim()) {
      setError('Please enter a SQL query');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await api.post('/dev/sql/query', {
        sql: sql.trim(),
        max_rows: maxRows,
      });
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Query failed');
    } finally {
      setLoading(false);
    }
  }, [api, sql, maxRows]);

  // Load preset
  const loadPreset = useCallback((preset: PresetQuery) => {
    setSql(preset.sql);
    setResult(null);
    setError(null);
  }, []);

  // Group presets by category
  const presetsByCategory = presets.reduce((acc, preset) => {
    if (!acc[preset.category]) {
      acc[preset.category] = [];
    }
    acc[preset.category].push(preset);
    return acc;
  }, {} as Record<string, PresetQuery[]>);

  return (
    <div className="sql-query-explorer h-full flex flex-col bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Icon name="database" size={20} />
          SQL Query Explorer
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Run read-only queries against the database
        </p>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Presets */}
        <div className="w-64 border-r border-gray-700 overflow-y-auto p-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Preset Queries
          </h3>

          {Object.entries(presetsByCategory).map(([category, categoryPresets]) => (
            <div key={category} className="mb-4">
              <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                {category}
              </h4>
              <div className="space-y-1">
                {categoryPresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => loadPreset(preset)}
                    className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-gray-800 transition-colors group"
                    title={preset.description}
                  >
                    <div className="font-medium text-gray-200 group-hover:text-white">
                      {preset.name}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {preset.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {presets.length === 0 && (
            <div className="text-sm text-gray-500 italic">
              Loading presets...
            </div>
          )}
        </div>

        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Query editor */}
          <div className="p-4 border-b border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">
                SQL Query
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-400">
                  <span>Max rows:</span>
                  <select
                    value={maxRows}
                    onChange={(e) => setMaxRows(Number(e.target.value))}
                    className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                  </select>
                </label>
                <button
                  onClick={executeQuery}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded font-medium text-sm transition-colors"
                >
                  {loading ? (
                    <>
                      <Icon name="loader" size={16} className="animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Icon name="play" size={16} />
                      Run Query
                    </>
                  )}
                </button>
              </div>
            </div>

            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              placeholder="Enter SQL query..."
              className="w-full h-32 px-3 py-2 bg-gray-800 border border-gray-600 rounded font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
              spellCheck={false}
            />

            <p className="text-xs text-gray-500 mt-2">
              Only SELECT queries allowed. Results limited to {maxRows} rows.
            </p>
          </div>

          {/* Results area */}
          <div className="flex-1 overflow-auto p-4">
            {/* Error */}
            {error && (
              <div className="p-4 bg-red-900/30 border border-red-700 rounded mb-4">
                <div className="flex items-center gap-2 text-red-400 font-medium">
                  <Icon name="alertCircle" size={16} />
                  Query Error
                </div>
                <p className="text-sm text-red-300 mt-1">{error}</p>
              </div>
            )}

            {/* Results */}
            {result && (
              <div>
                {/* Stats */}
                <div className="flex items-center gap-4 mb-4 text-sm text-gray-400">
                  <span>
                    <strong className="text-gray-200">{result.row_count}</strong> rows
                    {result.truncated && ' (truncated)'}
                  </span>
                  <span>
                    <strong className="text-gray-200">{result.execution_time_ms}</strong> ms
                  </span>
                  <span>
                    <strong className="text-gray-200">{result.columns.length}</strong> columns
                  </span>
                </div>

                {/* Table */}
                {result.rows.length > 0 ? (
                  <div className="overflow-x-auto border border-gray-700 rounded">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-800">
                        <tr>
                          {result.columns.map((col, i) => (
                            <th
                              key={i}
                              className="px-3 py-2 text-left font-medium text-gray-300 border-b border-gray-700"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row, rowIndex) => (
                          <tr
                            key={rowIndex}
                            className="hover:bg-gray-800/50 border-b border-gray-800"
                          >
                            {row.map((cell, cellIndex) => (
                              <td
                                key={cellIndex}
                                className="px-3 py-2 text-gray-300 font-mono"
                              >
                                {formatCell(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    Query returned no results
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {!result && !error && !loading && (
              <div className="text-center py-12 text-gray-500">
                <Icon name="database" size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg">Run a query to see results</p>
                <p className="text-sm mt-2">
                  Select a preset from the sidebar or write your own SQL
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatCell(value: any): string {
  if (value === null) {
    return '(null)';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

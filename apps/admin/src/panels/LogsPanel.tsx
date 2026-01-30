import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAdminContext } from '../adminContext';
import { clearServiceLogs, getServiceLogs } from '../lib/api';
import type { LogLevel, LogsResponse } from '../lib/types';

const LOG_LEVELS: LogLevel[] = ['CRITICAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG'];
const TAIL_SIZES = [50, 100, 250, 500, 1000];

export function LogsPanel() {
  const { services } = useAdminContext();

  const [selectedService, setSelectedService] = useState<string>('');
  const [logLevel, setLogLevel] = useState<LogLevel | ''>('');
  const [filterText, setFilterText] = useState('');
  const [tailSize, setTailSize] = useState(100);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(5000);

  const [logs, setLogs] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-select first service if none selected
  useEffect(() => {
    if (!selectedService && services.length > 0) {
      setSelectedService(services[0].key);
    }
  }, [services, selectedService]);

  const fetchLogs = useCallback(async () => {
    if (!selectedService) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await getServiceLogs(selectedService, {
        tail: tailSize,
        filter_text: filterText || undefined,
        filter_level: logLevel || undefined,
      });
      setLogs(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs');
      setLogs(null);
    } finally {
      setLoading(false);
    }
  }, [selectedService, tailSize, filterText, logLevel]);

  // Initial fetch and when filters change
  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || !selectedService) {
      return;
    }
    const interval = setInterval(fetchLogs, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, selectedService, fetchLogs]);

  const handleClearLogs = useCallback(async () => {
    if (!selectedService) {
      return;
    }
    try {
      await clearServiceLogs(selectedService);
      await fetchLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear logs');
    }
  }, [selectedService, fetchLogs]);

  const serviceOptions = useMemo(() => {
    return services.map((service) => ({
      key: service.key,
      label: service.title,
    }));
  }, [services]);

  return (
    <div className="panel-card h-full flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="section-title">Logs</p>
          <h2 className="text-2xl font-semibold">Service logs</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="pill-input">
            <span>Auto refresh</span>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
          </label>
          <select
            className="select-field"
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            disabled={!autoRefresh}
          >
            {[3000, 5000, 10000, 30000].map((interval) => (
              <option key={interval} value={interval}>
                {interval / 1000}s
              </option>
            ))}
          </select>
          <button className="ghost-button" onClick={handleClearLogs} disabled={!selectedService}>
            Clear logs
          </button>
          <button className="ghost-button" onClick={fetchLogs} disabled={!selectedService}>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          className="select-field min-w-[180px]"
          value={selectedService}
          onChange={(e) => setSelectedService(e.target.value)}
        >
          <option value="">Select service...</option>
          {serviceOptions.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          className="select-field"
          value={logLevel}
          onChange={(e) => setLogLevel(e.target.value as LogLevel | '')}
        >
          <option value="">All levels</option>
          {LOG_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
        <select
          className="select-field"
          value={tailSize}
          onChange={(e) => setTailSize(Number(e.target.value))}
        >
          {TAIL_SIZES.map((size) => (
            <option key={size} value={size}>
              Last {size} lines
            </option>
          ))}
        </select>
        <div className="flex-1 min-w-[200px]">
          <input
            className="input-field"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search in logs..."
          />
        </div>
      </div>

      {logs && (
        <div className="flex items-center gap-4 text-xs text-[var(--ink-muted)]">
          <span>
            Showing {logs.lines.length} of {logs.total_lines} lines
          </span>
          {logs.filtered && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Filtered</span>}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-200 bg-slate-900 p-4">
        {loading && !logs ? (
          <div className="text-sm text-slate-400">Loading logs...</div>
        ) : !selectedService ? (
          <div className="text-sm text-slate-400">Select a service to view logs.</div>
        ) : !logs || logs.lines.length === 0 ? (
          <div className="text-sm text-slate-400">No log entries found.</div>
        ) : (
          <pre className="font-mono text-xs text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
            {logs.lines.map((line, index) => (
              <LogLine key={index} line={line} />
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}

function LogLine({ line }: { line: string }) {
  const levelColor = useMemo(() => {
    if (line.includes('ERROR') || line.includes('CRITICAL')) {
      return 'text-rose-400';
    }
    if (line.includes('WARNING')) {
      return 'text-amber-400';
    }
    if (line.includes('DEBUG')) {
      return 'text-slate-500';
    }
    return 'text-slate-200';
  }, [line]);

  return (
    <div className={`${levelColor} hover:bg-slate-800/50`}>
      {line}
    </div>
  );
}

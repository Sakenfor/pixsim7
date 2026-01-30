import { useCallback, useEffect, useState } from 'react';

import { getAPIHealth, getStatistics } from '../lib/api';
import type { APIHealthResponse, StatisticsResponse } from '../lib/types';

export function HealthPanel() {
  const [health, setHealth] = useState<APIHealthResponse | null>(null);
  const [stats, setStats] = useState<StatisticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(10000);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [healthResponse, statsResponse] = await Promise.all([getAPIHealth(), getStatistics()]);
      setHealth(healthResponse);
      setStats(statsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchData]);

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  return (
    <div className="panel-card h-full flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="section-title">Health</p>
          <h2 className="text-2xl font-semibold">System health</h2>
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
            {[5000, 10000, 30000, 60000].map((interval) => (
              <option key={interval} value={interval}>
                {interval / 1000}s
              </option>
            ))}
          </select>
          <button className="ghost-button" onClick={fetchData}>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {loading && !health && !stats ? (
        <div className="text-sm text-[var(--ink-muted)]">Loading health data...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Overall Health Card */}
          {health && (
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">API Status</h3>
                <span
                  className={`rounded-full px-3 py-1 text-xs uppercase font-medium ${
                    health.status === 'healthy'
                      ? 'bg-emerald-500/20 text-emerald-900'
                      : 'bg-amber-500/20 text-amber-900'
                  }`}
                >
                  {health.status}
                </span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--ink-muted)]">Version</span>
                  <span className="font-mono">{health.version}</span>
                </div>
              </div>
            </div>
          )}

          {/* Statistics Card */}
          {stats && (
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-5">
              <h3 className="text-lg font-semibold mb-4">Statistics</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--ink-muted)]">Uptime</span>
                  <span className="font-semibold">{formatUptime(stats.uptime_seconds)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--ink-muted)]">Total services</span>
                  <span className="font-semibold">{stats.services_total}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--ink-muted)]">Running</span>
                  <span className="font-semibold text-emerald-700">{stats.services_running}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--ink-muted)]">Healthy</span>
                  <span className="font-semibold text-emerald-700">{stats.services_healthy}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--ink-muted)]">Unhealthy</span>
                  <span className={`font-semibold ${stats.services_unhealthy > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
                    {stats.services_unhealthy}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Managers Card */}
          {health && (
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 md:col-span-2">
              <h3 className="text-lg font-semibold mb-4">Managers</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {Object.entries(health.managers).map(([name, operational]) => (
                  <div
                    key={name}
                    className={`rounded-xl px-4 py-3 ${
                      operational ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${operational ? 'bg-emerald-500' : 'bg-rose-500'}`}
                      />
                      <span className="text-sm font-medium capitalize">
                        {name.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className={`text-xs mt-1 ${operational ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {operational ? 'Operational' : 'Not operational'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Event Bus Card */}
          {health && Object.keys(health.event_bus).length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 md:col-span-2">
              <h3 className="text-lg font-semibold mb-4">Event Bus</h3>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                {Object.entries(health.event_bus).map(([key, value]) => (
                  <div key={key} className="text-sm">
                    <span className="text-[var(--ink-muted)] capitalize">{key.replace(/_/g, ' ')}</span>
                    <p className="font-semibold mt-0.5">
                      {typeof value === 'number' ? value.toLocaleString() : String(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

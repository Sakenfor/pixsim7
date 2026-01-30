import { useCallback, useEffect, useState } from 'react';

import { getEventStats, getStatistics } from '../lib/api';
import type { EventStatsResponse, StatisticsResponse } from '../lib/types';

export function EventsStatsPanel() {
  const [eventStats, setEventStats] = useState<EventStatsResponse | null>(null);
  const [systemStats, setSystemStats] = useState<StatisticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [eventsResponse, statsResponse] = await Promise.all([getEventStats(), getStatistics()]);
      setEventStats(eventsResponse);
      setSystemStats(statsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events data');
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

  // Extract known stats fields and other fields
  const knownFields = ['total_events', 'events_by_type', 'subscribers', 'active_websocket_connections'];
  const otherStats = eventStats
    ? Object.entries(eventStats).filter(([key]) => !knownFields.includes(key))
    : [];

  return (
    <div className="panel-card h-full flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="section-title">Events & Stats</p>
          <h2 className="text-2xl font-semibold">System activity</h2>
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

      {loading && !eventStats && !systemStats ? (
        <div className="text-sm text-[var(--ink-muted)]">Loading events data...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Overview Stats */}
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-5">
            <h3 className="text-lg font-semibold mb-4">Overview</h3>
            <div className="grid grid-cols-2 gap-4">
              {eventStats && (
                <>
                  <div className="text-center p-3 rounded-xl bg-slate-50">
                    <p className="text-2xl font-bold text-[var(--tide-bright)]">
                      {eventStats.total_events?.toLocaleString() ?? 0}
                    </p>
                    <p className="text-xs text-[var(--ink-muted)] mt-1">Total Events</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-slate-50">
                    <p className="text-2xl font-bold text-[var(--tide-bright)]">
                      {eventStats.active_websocket_connections ?? 0}
                    </p>
                    <p className="text-xs text-[var(--ink-muted)] mt-1">WebSocket Clients</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-slate-50">
                    <p className="text-2xl font-bold text-[var(--tide-bright)]">
                      {eventStats.subscribers ?? 0}
                    </p>
                    <p className="text-xs text-[var(--ink-muted)] mt-1">Subscribers</p>
                  </div>
                </>
              )}
              {systemStats && (
                <div className="text-center p-3 rounded-xl bg-slate-50">
                  <p className="text-2xl font-bold text-[var(--tide-bright)]">
                    {formatUptime(systemStats.uptime_seconds)}
                  </p>
                  <p className="text-xs text-[var(--ink-muted)] mt-1">API Uptime</p>
                </div>
              )}
            </div>
          </div>

          {/* Service Summary */}
          {systemStats && (
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-5">
              <h3 className="text-lg font-semibold mb-4">Service Summary</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--ink-muted)]">Total</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-slate-400 rounded-full"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <span className="text-sm font-semibold w-8 text-right">{systemStats.services_total}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--ink-muted)]">Running</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{
                          width: systemStats.services_total > 0
                            ? `${(systemStats.services_running / systemStats.services_total) * 100}%`
                            : '0%',
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold w-8 text-right text-emerald-700">
                      {systemStats.services_running}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--ink-muted)]">Healthy</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{
                          width: systemStats.services_total > 0
                            ? `${(systemStats.services_healthy / systemStats.services_total) * 100}%`
                            : '0%',
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold w-8 text-right text-emerald-700">
                      {systemStats.services_healthy}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--ink-muted)]">Unhealthy</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-500 rounded-full"
                        style={{
                          width: systemStats.services_total > 0
                            ? `${(systemStats.services_unhealthy / systemStats.services_total) * 100}%`
                            : '0%',
                        }}
                      />
                    </div>
                    <span className={`text-sm font-semibold w-8 text-right ${systemStats.services_unhealthy > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
                      {systemStats.services_unhealthy}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Events by Type */}
          {eventStats?.events_by_type && Object.keys(eventStats.events_by_type).length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 md:col-span-2">
              <h3 className="text-lg font-semibold mb-4">Events by Type</h3>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {Object.entries(eventStats.events_by_type)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => (
                    <div
                      key={type}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50"
                    >
                      <span className="text-xs font-mono text-[var(--ink-muted)] truncate mr-2" title={type}>
                        {type}
                      </span>
                      <span className="text-sm font-semibold">{count.toLocaleString()}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Other Stats */}
          {otherStats.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 md:col-span-2">
              <h3 className="text-lg font-semibold mb-4">Additional Stats</h3>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                {otherStats.map(([key, value]) => (
                  <div key={key} className="text-sm">
                    <span className="text-[var(--ink-muted)] capitalize">{key.replace(/_/g, ' ')}</span>
                    <p className="font-semibold mt-0.5">
                      {typeof value === 'number'
                        ? value.toLocaleString()
                        : typeof value === 'object'
                          ? JSON.stringify(value)
                          : String(value)}
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

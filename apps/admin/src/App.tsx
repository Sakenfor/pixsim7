import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getBuildables,
  getServices,
  getSettings,
  restartService,
  startAllServices,
  startService,
  stopAllServices,
  stopService,
  updateSettings,
} from './lib/api';
import type { BuildableDefinition, ServiceState, SharedSettings } from './lib/types';

type LoadState = 'idle' | 'loading' | 'error';

const STATUS_STYLES: Record<string, string> = {
  running: 'bg-emerald-500/20 text-emerald-900',
  starting: 'bg-amber-500/20 text-amber-900',
  stopping: 'bg-amber-500/20 text-amber-900',
  stopped: 'bg-slate-400/20 text-slate-700',
  failed: 'bg-rose-500/20 text-rose-900',
};

const HEALTH_STYLES: Record<string, string> = {
  healthy: 'text-emerald-700',
  starting: 'text-amber-600',
  unhealthy: 'text-rose-700',
  stopped: 'text-slate-500',
  unknown: 'text-slate-400',
};

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'stopped', label: 'Stopped' },
  { id: 'attention', label: 'Attention' },
] as const;

const STATUS_ORDER: Record<string, number> = {
  failed: 0,
  stopping: 1,
  starting: 2,
  running: 3,
  stopped: 4,
};

export default function App() {
  const [services, setServices] = useState<ServiceState[]>([]);
  const [buildables, setBuildables] = useState<BuildableDefinition[]>([]);
  const [settings, setSettings] = useState<SharedSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<SharedSettings | null>(null);

  const [servicesState, setServicesState] = useState<LoadState>('idle');
  const [buildablesState, setBuildablesState] = useState<LoadState>('idle');
  const [settingsState, setSettingsState] = useState<LoadState>('idle');

  const [servicesError, setServicesError] = useState('');
  const [buildablesError, setBuildablesError] = useState('');
  const [settingsError, setSettingsError] = useState('');

  const [serviceQuery, setServiceQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]['id']>('all');
  const [buildableQuery, setBuildableQuery] = useState('');
  const [buildableCategory, setBuildableCategory] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);
  const [lastServicesRefresh, setLastServicesRefresh] = useState<Date | null>(null);

  const runningCount = useMemo(
    () => services.filter((service) => service.status === 'running' || service.status === 'starting').length,
    [services],
  );
  const healthyCount = useMemo(
    () => services.filter((service) => service.health === 'healthy').length,
    [services],
  );

  const statusCounts = useMemo(() => {
    return services.reduce(
      (acc, service) => {
        acc.total += 1;
        if (service.status === 'running' || service.status === 'starting') {
          acc.running += 1;
        }
        if (service.status === 'stopped') {
          acc.stopped += 1;
        }
        if (service.status === 'failed' || service.health === 'unhealthy') {
          acc.attention += 1;
        }
        return acc;
      },
      { total: 0, running: 0, stopped: 0, attention: 0 },
    );
  }, [services]);

  const filteredServices = useMemo(() => {
    let list = [...services];
    if (statusFilter === 'running') {
      list = list.filter((service) => service.status === 'running' || service.status === 'starting');
    } else if (statusFilter === 'stopped') {
      list = list.filter((service) => service.status === 'stopped');
    } else if (statusFilter === 'attention') {
      list = list.filter((service) => service.status === 'failed' || service.health === 'unhealthy');
    }
    if (serviceQuery.trim()) {
      const query = serviceQuery.trim().toLowerCase();
      list = list.filter(
        (service) =>
          service.title.toLowerCase().includes(query) || service.key.toLowerCase().includes(query),
      );
    }
    return list.sort((a, b) => {
      const orderDelta = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
      if (orderDelta !== 0) {
        return orderDelta;
      }
      return a.title.localeCompare(b.title);
    });
  }, [serviceQuery, services, statusFilter]);

  const buildableCategories = useMemo(() => {
    const categories = new Set<string>();
    buildables.forEach((buildable) => {
      if (buildable.category) {
        categories.add(buildable.category);
      }
    });
    return ['all', ...Array.from(categories).sort((a, b) => a.localeCompare(b))];
  }, [buildables]);

  const filteredBuildables = useMemo(() => {
    let list = [...buildables];
    if (buildableCategory !== 'all') {
      list = list.filter((buildable) => buildable.category === buildableCategory);
    }
    if (buildableQuery.trim()) {
      const query = buildableQuery.trim().toLowerCase();
      list = list.filter(
        (buildable) =>
          buildable.title.toLowerCase().includes(query) ||
          buildable.package.toLowerCase().includes(query) ||
          buildable.directory.toLowerCase().includes(query),
      );
    }
    return list;
  }, [buildableCategory, buildableQuery, buildables]);

  const refreshServices = useCallback(async () => {
    setServicesState('loading');
    setServicesError('');
    try {
      const response = await getServices();
      setServices(response.services);
      setLastServicesRefresh(new Date());
      setServicesState('idle');
    } catch (error) {
      setServicesError(error instanceof Error ? error.message : 'Failed to load services');
      setServicesState('error');
    }
  }, []);

  const refreshBuildables = useCallback(async () => {
    setBuildablesState('loading');
    setBuildablesError('');
    try {
      const response = await getBuildables();
      setBuildables(response.buildables);
      setBuildablesState('idle');
    } catch (error) {
      setBuildablesError(error instanceof Error ? error.message : 'Failed to load buildables');
      setBuildablesState('error');
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    setSettingsState('loading');
    setSettingsError('');
    try {
      const response = await getSettings();
      setSettings(response);
      setSettingsDraft(response);
      setSettingsState('idle');
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Failed to load settings');
      setSettingsState('error');
    }
  }, []);

  useEffect(() => {
    refreshServices();
    refreshBuildables();
    refreshSettings();
  }, [refreshBuildables, refreshServices, refreshSettings]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }
    const interval = setInterval(refreshServices, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, refreshServices]);

  async function handleServiceAction(action: 'start' | 'stop' | 'restart', serviceKey: string) {
    try {
      if (action === 'start') {
        await startService(serviceKey);
      } else if (action === 'stop') {
        await stopService(serviceKey);
      } else {
        await restartService(serviceKey);
      }
      await refreshServices();
    } catch (error) {
      setServicesError(error instanceof Error ? error.message : 'Service action failed');
    }
  }

  async function handleBulkAction(action: 'start' | 'stop') {
    try {
      if (action === 'start') {
        await startAllServices();
      } else {
        await stopAllServices();
      }
      await refreshServices();
    } catch (error) {
      setServicesError(error instanceof Error ? error.message : 'Bulk action failed');
    }
  }

  async function handleCopyCommand(buildable: BuildableDefinition) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    const command = [buildable.command, ...(buildable.args || [])].join(' ');
    try {
      await navigator.clipboard.writeText(command);
    } catch (error) {
      console.warn('Clipboard unavailable', error);
    }
  }

  async function handleSaveSettings() {
    if (!settingsDraft) {
      return;
    }
    setSettingsState('loading');
    setSettingsError('');
    try {
      const updated = await updateSettings(settingsDraft);
      setSettings(updated);
      setSettingsDraft(updated);
      setSettingsState('idle');
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Failed to update settings');
      setSettingsState('error');
    }
  }

  const settingsDirty = useMemo(() => {
    if (!settings || !settingsDraft) {
      return false;
    }
    return JSON.stringify(settings) !== JSON.stringify(settingsDraft);
  }, [settings, settingsDraft]);

  const refreshLabel = lastServicesRefresh
    ? `Last sync ${lastServicesRefresh.toLocaleTimeString()}`
    : 'No recent sync';

  return (
    <div className="app-shell">
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10">
        <header className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <p className="section-title">PixSim Admin Console</p>
            <h1 className="text-4xl font-semibold text-[var(--ink)]">
              Launcher Status, Buildables, and Shared Settings
            </h1>
            <p className="max-w-2xl text-sm text-[var(--ink-muted)]">
              A single surface for local control and remote-ready admin tasks. Changes to shared settings apply on
              restart of affected services.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="status-pill">{runningCount}/{services.length} running</span>
            <span className="status-pill">{healthyCount} healthy</span>
            <span className="status-pill">API: {import.meta.env.VITE_API_URL || 'http://localhost:8100'}</span>
          </div>
        </header>

        <section className="panel-card fade-in">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="section-title">Services</p>
              <h2 className="text-2xl font-semibold">Runtime control</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">{refreshLabel}</span>
              <label className="pill-input">
                <span>Auto refresh</span>
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(event) => setAutoRefresh(event.target.checked)}
                />
              </label>
              <select
                className="select-field"
                value={refreshInterval}
                onChange={(event) => setRefreshInterval(Number(event.target.value))}
              >
                {[3000, 5000, 10000, 30000].map((interval) => (
                  <option key={interval} value={interval}>
                    {interval / 1000}s cadence
                  </option>
                ))}
              </select>
              <button className="action-button" onClick={() => handleBulkAction('start')}>
                Start all
              </button>
              <button className="ghost-button" onClick={() => handleBulkAction('stop')}>
                Stop all
              </button>
              <button className="ghost-button" onClick={refreshServices}>
                Refresh
              </button>
            </div>
          </div>
          {servicesError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {servicesError}
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((filter) => {
                const count =
                  filter.id === 'running'
                    ? statusCounts.running
                    : filter.id === 'stopped'
                      ? statusCounts.stopped
                      : filter.id === 'attention'
                        ? statusCounts.attention
                        : statusCounts.total;
                return (
                  <button
                    key={filter.id}
                    className={`filter-chip ${statusFilter === filter.id ? 'filter-chip--active' : ''}`}
                    onClick={() => setStatusFilter(filter.id)}
                  >
                    {filter.label} <span className="opacity-70">({count})</span>
                  </button>
                );
              })}
            </div>
            <div className="flex-1 min-w-[220px]">
              <input
                className="input-field"
                value={serviceQuery}
                onChange={(event) => setServiceQuery(event.target.value)}
                placeholder="Search services by name or key"
              />
            </div>
          </div>
          <div className="stagger mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {servicesState === 'loading' && services.length === 0 ? (
              <div className="text-sm text-[var(--ink-muted)]">Loading services...</div>
            ) : filteredServices.length === 0 ? (
              <div className="text-sm text-[var(--ink-muted)]">No services match the current filters.</div>
            ) : (
              filteredServices.map((service) => (
                <div key={service.key} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">{service.title}</h3>
                      <p className="text-xs text-[var(--ink-muted)]">{service.key}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs uppercase ${STATUS_STYLES[service.status]}`}>
                      {service.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-sm">
                    <span className={`font-semibold ${HEALTH_STYLES[service.health]}`}>{service.health}</span>
                    {service.pid ? <span className="text-xs text-[var(--ink-muted)]">pid {service.pid}</span> : null}
                  </div>
                  {service.last_error ? (
                    <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
                      {service.last_error}
                    </div>
                  ) : null}
                  {!service.tool_available ? (
                    <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {service.tool_check_message || 'Missing tool'}
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {service.status === 'running' || service.status === 'starting' ? (
                      <>
                        <button
                          className="ghost-button"
                          onClick={() => handleServiceAction('stop', service.key)}
                        >
                          Stop
                        </button>
                        <button
                          className="action-button"
                          onClick={() => handleServiceAction('restart', service.key)}
                        >
                          Restart
                        </button>
                      </>
                    ) : (
                      <button
                        className="action-button"
                        onClick={() => handleServiceAction('start', service.key)}
                      >
                        Start
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel-card fade-in">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="section-title">Buildables</p>
              <h2 className="text-2xl font-semibold">PNPM targets</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <select
                className="select-field"
                value={buildableCategory}
                onChange={(event) => setBuildableCategory(event.target.value)}
              >
                {buildableCategories.map((category) => (
                  <option key={category} value={category}>
                    {category === 'all' ? 'All categories' : category}
                  </option>
                ))}
              </select>
              <button className="ghost-button" onClick={refreshBuildables}>
                Refresh
              </button>
            </div>
          </div>
          <div className="mt-5">
            <input
              className="input-field"
              value={buildableQuery}
              onChange={(event) => setBuildableQuery(event.target.value)}
              placeholder="Search buildables by package or directory"
            />
          </div>
          {buildablesError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {buildablesError}
            </div>
          )}
          <div className="stagger mt-6 grid gap-4 md:grid-cols-2">
            {buildablesState === 'loading' && buildables.length === 0 ? (
              <div className="text-sm text-[var(--ink-muted)]">Loading buildables...</div>
            ) : filteredBuildables.length === 0 ? (
              <div className="text-sm text-[var(--ink-muted)]">No buildables discovered.</div>
            ) : (
              filteredBuildables.map((buildable) => (
                <div key={buildable.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">{buildable.title}</h3>
                      <p className="text-xs text-[var(--ink-muted)]">{buildable.package}</p>
                    </div>
                    {buildable.category ? <span className="status-pill">{buildable.category}</span> : null}
                  </div>
                  {buildable.description ? (
                    <p className="mt-2 text-sm text-[var(--ink-muted)]">{buildable.description}</p>
                  ) : null}
                  <div className="mt-3 mono-chip">
                    {buildable.command} {buildable.args.join(' ')}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="ghost-button" onClick={() => handleCopyCommand(buildable)}>
                      Copy command
                    </button>
                    <span className="text-xs text-[var(--ink-muted)]">dir: {buildable.directory}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel-card fade-in">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="section-title">Shared settings</p>
              <h2 className="text-2xl font-semibold">Environment controls</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="ghost-button" onClick={refreshSettings}>
                Refresh
              </button>
              <button
                className="ghost-button"
                onClick={() => settings && setSettingsDraft(settings)}
                disabled={!settingsDirty}
              >
                Reset
              </button>
            </div>
          </div>
          {settingsError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {settingsError}
            </div>
          )}
          {settingsState === 'loading' && !settingsDraft ? (
            <div className="mt-4 text-sm text-[var(--ink-muted)]">Loading settings...</div>
          ) : settingsDraft ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                <span>SQL logging</span>
                <input
                  type="checkbox"
                  checked={settingsDraft.sql_logging_enabled}
                  onChange={(event) =>
                    setSettingsDraft({ ...settingsDraft, sql_logging_enabled: event.target.checked })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                <span>Use local datastores</span>
                <input
                  type="checkbox"
                  checked={settingsDraft.use_local_datastores}
                  onChange={(event) =>
                    setSettingsDraft({ ...settingsDraft, use_local_datastores: event.target.checked })
                  }
                />
              </label>
              <label className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                <span>Worker debug flags</span>
                <input
                  type="text"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={settingsDraft.worker_debug_flags}
                  onChange={(event) =>
                    setSettingsDraft({ ...settingsDraft, worker_debug_flags: event.target.value })
                  }
                  placeholder="generation,provider,worker"
                />
              </label>
              <label className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                <span>Backend log level</span>
                <select
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={settingsDraft.backend_log_level}
                  onChange={(event) =>
                    setSettingsDraft({ ...settingsDraft, backend_log_level: event.target.value })
                  }
                >
                  {['INFO', 'DEBUG', 'WARNING', 'ERROR'].map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="mt-4 text-sm text-[var(--ink-muted)]">No settings available.</div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="action-button"
              onClick={handleSaveSettings}
              disabled={!settingsDirty || settingsState === 'loading'}
            >
              Save settings
            </button>
            {settingsDirty ? (
              <span className="text-xs text-[var(--ink-muted)]">Unsaved changes</span>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

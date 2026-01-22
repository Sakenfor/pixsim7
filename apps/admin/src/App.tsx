import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getBuildables,
  getCodegenTasks,
  getServiceDefinition,
  getServices,
  getSettings,
  restartService,
  startAllServices,
  startService,
  stopAllServices,
  stopService,
  updateSettings,
} from './lib/api';
import type {
  BuildableDefinition,
  CodegenTask,
  LauncherSettings,
  ServiceDefinition,
  ServiceState,
} from './lib/types';

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
  const [serviceDefinitions, setServiceDefinitions] = useState<Record<string, ServiceDefinition>>({});
  const [serviceDefinitionState, setServiceDefinitionState] = useState<Record<string, LoadState>>({});
  const [serviceDefinitionErrors, setServiceDefinitionErrors] = useState<Record<string, string>>({});
  const [buildables, setBuildables] = useState<BuildableDefinition[]>([]);
  const [codegenTasks, setCodegenTasks] = useState<CodegenTask[]>([]);
  const [settings, setSettings] = useState<LauncherSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<LauncherSettings | null>(null);

  const [servicesState, setServicesState] = useState<LoadState>('idle');
  const [buildablesState, setBuildablesState] = useState<LoadState>('idle');
  const [codegenState, setCodegenState] = useState<LoadState>('idle');
  const [settingsState, setSettingsState] = useState<LoadState>('idle');

  const [servicesError, setServicesError] = useState('');
  const [buildablesError, setBuildablesError] = useState('');
  const [codegenError, setCodegenError] = useState('');
  const [settingsError, setSettingsError] = useState('');

  const [serviceQuery, setServiceQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]['id']>('all');
  const [serviceDetailsOpen, setServiceDetailsOpen] = useState<Record<string, boolean>>({});
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

  const refreshServiceDefinition = useCallback(async (serviceKey: string) => {
    setServiceDefinitionState((prev) => ({ ...prev, [serviceKey]: 'loading' }));
    setServiceDefinitionErrors((prev) => ({ ...prev, [serviceKey]: '' }));
    try {
      const response = await getServiceDefinition(serviceKey);
      setServiceDefinitions((prev) => ({ ...prev, [serviceKey]: response }));
      setServiceDefinitionState((prev) => ({ ...prev, [serviceKey]: 'idle' }));
    } catch (error) {
      setServiceDefinitionErrors((prev) => ({
        ...prev,
        [serviceKey]: error instanceof Error ? error.message : 'Failed to load service definition',
      }));
      setServiceDefinitionState((prev) => ({ ...prev, [serviceKey]: 'error' }));
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

  const refreshCodegenTasks = useCallback(async () => {
    setCodegenState('loading');
    setCodegenError('');
    try {
      const response = await getCodegenTasks();
      setCodegenTasks(response.tasks);
      setCodegenState('idle');
    } catch (error) {
      setCodegenError(error instanceof Error ? error.message : 'Failed to load codegen tasks');
      setCodegenState('error');
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
    refreshCodegenTasks();
    refreshSettings();
  }, [refreshBuildables, refreshCodegenTasks, refreshServices, refreshSettings]);

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

  async function handleToggleServiceDetails(serviceKey: string) {
    const nextState = !serviceDetailsOpen[serviceKey];
    setServiceDetailsOpen((prev) => ({ ...prev, [serviceKey]: nextState }));
    if (nextState && !serviceDefinitions[serviceKey] && serviceDefinitionState[serviceKey] !== 'loading') {
      await refreshServiceDefinition(serviceKey);
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

  async function handleCopyCommand(command: string, args: string[]) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    const commandLine = [command, ...(args || [])].join(' ');
    try {
      await navigator.clipboard.writeText(commandLine);
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
      const updated = await updateSettings({
        logging: settingsDraft.logging,
        datastores: settingsDraft.datastores,
        ports: settingsDraft.ports,
        base_urls: settingsDraft.base_urls,
        advanced: settingsDraft.advanced,
        profiles: { active: settingsDraft.profiles.active },
      });
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

  function updateLoggingDraft(
    key: keyof LauncherSettings['logging'],
    value: LauncherSettings['logging'][keyof LauncherSettings['logging']],
  ) {
    if (!settingsDraft) {
      return;
    }
    setSettingsDraft({
      ...settingsDraft,
      logging: { ...settingsDraft.logging, [key]: value },
    });
  }

  function updateDatastoreDraft(
    key: keyof LauncherSettings['datastores'],
    value: LauncherSettings['datastores'][keyof LauncherSettings['datastores']],
  ) {
    if (!settingsDraft) {
      return;
    }
    setSettingsDraft({
      ...settingsDraft,
      datastores: { ...settingsDraft.datastores, [key]: value },
    });
  }

  function updatePortsDraft(
    key: keyof LauncherSettings['ports'],
    value: LauncherSettings['ports'][keyof LauncherSettings['ports']],
  ) {
    if (!settingsDraft) {
      return;
    }
    setSettingsDraft({
      ...settingsDraft,
      ports: { ...settingsDraft.ports, [key]: Number(value) },
    });
  }

  function updateBaseUrlDraft(
    key: keyof LauncherSettings['base_urls'],
    value: LauncherSettings['base_urls'][keyof LauncherSettings['base_urls']],
  ) {
    if (!settingsDraft) {
      return;
    }
    setSettingsDraft({
      ...settingsDraft,
      base_urls: { ...settingsDraft.base_urls, [key]: String(value) },
    });
  }

  function updateAdvancedDraft(
    key: keyof LauncherSettings['advanced'],
    value: LauncherSettings['advanced'][keyof LauncherSettings['advanced']],
  ) {
    if (!settingsDraft) {
      return;
    }
    setSettingsDraft({
      ...settingsDraft,
      advanced: { ...settingsDraft.advanced, [key]: String(value) },
    });
  }

  function updateProfileDraft(value: string) {
    if (!settingsDraft) {
      return;
    }
    setSettingsDraft({
      ...settingsDraft,
      profiles: { ...settingsDraft.profiles, active: value },
    });
  }

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
              A single surface for local control and remote-ready admin tasks. Changes to launcher settings apply on
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
                    <button className="ghost-button" onClick={() => handleToggleServiceDetails(service.key)}>
                      {serviceDetailsOpen[service.key] ? 'Hide details' : 'Details'}
                    </button>
                  </div>
                  {serviceDetailsOpen[service.key] ? (
                    <div className="detail-card">
                      {serviceDefinitionState[service.key] === 'loading' ? (
                        <div className="text-xs text-[var(--ink-muted)]">Loading definition…</div>
                      ) : serviceDefinitionErrors[service.key] ? (
                        <div className="text-xs text-rose-700">{serviceDefinitionErrors[service.key]}</div>
                      ) : serviceDefinitions[service.key] ? (
                        <div className="detail-grid">
                          <div>
                            <p className="detail-label">Command</p>
                            <div className="mono-chip mt-2">
                              {serviceDefinitions[service.key].program}{' '}
                              {serviceDefinitions[service.key].args.join(' ')}
                            </div>
                          </div>
                          <div>
                            <p className="detail-label">Working directory</p>
                            <p className="detail-value">{serviceDefinitions[service.key].cwd}</p>
                          </div>
                          {serviceDefinitions[service.key].required_tool ? (
                            <div>
                              <p className="detail-label">Required tool</p>
                              <p className="detail-value">{serviceDefinitions[service.key].required_tool}</p>
                            </div>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            {serviceDefinitions[service.key].url ? (
                              <a
                                className="link-chip"
                                href={serviceDefinitions[service.key].url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open service
                              </a>
                            ) : null}
                            {serviceDefinitions[service.key].health_url ? (
                              <a
                                className="link-chip"
                                href={serviceDefinitions[service.key].health_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Health check
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-[var(--ink-muted)]">No definition available.</div>
                      )}
                    </div>
                  ) : null}
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
                    <button className="ghost-button" onClick={() => handleCopyCommand(buildable.command, buildable.args)}>
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
              <p className="section-title">Codegen</p>
              <h2 className="text-2xl font-semibold">Schema + type generators</h2>
            </div>
            <button className="ghost-button" onClick={refreshCodegenTasks}>
              Refresh
            </button>
          </div>
          {codegenError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {codegenError}
            </div>
          )}
          <div className="stagger mt-6 grid gap-4 md:grid-cols-2">
            {codegenState === 'loading' && codegenTasks.length === 0 ? (
              <div className="text-sm text-[var(--ink-muted)]">Loading codegen tasks...</div>
            ) : codegenTasks.length === 0 ? (
              <div className="text-sm text-[var(--ink-muted)]">No codegen tasks discovered.</div>
            ) : (
              codegenTasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">{task.id}</h3>
                      <p className="text-xs text-[var(--ink-muted)]">{task.description}</p>
                    </div>
                    {task.groups && task.groups.length > 0 ? (
                      <span className="status-pill">{task.groups.join(', ')}</span>
                    ) : null}
                  </div>
                  <div className="mt-3 mono-chip">pnpm codegen -- --only {task.id}</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className="ghost-button"
                      onClick={() => handleCopyCommand('pnpm', ['codegen', '--', '--only', task.id])}
                    >
                      Copy run command
                    </button>
                    {task.supports_check ? (
                      <button
                        className="ghost-button"
                        onClick={() =>
                          handleCopyCommand('pnpm', ['codegen', '--', '--only', task.id, '--check'])
                        }
                      >
                        Copy check command
                      </button>
                    ) : null}
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
              <h2 className="text-2xl font-semibold">Launcher settings</h2>
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
            <div className="mt-6 grid gap-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                  <span>SQL logging</span>
                  <input
                    type="checkbox"
                    checked={settingsDraft.logging.sql_logging_enabled}
                    onChange={(event) => updateLoggingDraft('sql_logging_enabled', event.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                  <span>Use local datastores</span>
                  <input
                    type="checkbox"
                    checked={settingsDraft.datastores.use_local_datastores}
                    onChange={(event) => updateDatastoreDraft('use_local_datastores', event.target.checked)}
                  />
                </label>
                <label className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                  <span>Worker debug flags</span>
                  <input
                    type="text"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={settingsDraft.logging.worker_debug_flags}
                    onChange={(event) => updateLoggingDraft('worker_debug_flags', event.target.value)}
                    placeholder="generation,provider,worker"
                  />
                </label>
                <label className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                  <span>Backend log level</span>
                  <select
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={settingsDraft.logging.backend_log_level}
                    onChange={(event) => updateLoggingDraft('backend_log_level', event.target.value)}
                  >
                    {['INFO', 'DEBUG', 'WARNING', 'ERROR'].map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                  <span>Local DATABASE_URL</span>
                  <input
                    type="text"
                    className="input-field"
                    value={settingsDraft.datastores.local_database_url}
                    onChange={(event) => updateDatastoreDraft('local_database_url', event.target.value)}
                    placeholder="postgresql://pixsim:pixsim123@127.0.0.1:5432/pixsim7"
                  />
                </label>
                <label className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                  <span>Local REDIS_URL</span>
                  <input
                    type="text"
                    className="input-field"
                    value={settingsDraft.datastores.local_redis_url}
                    onChange={(event) => updateDatastoreDraft('local_redis_url', event.target.value)}
                    placeholder="redis://localhost:6379/0"
                  />
                </label>
              </div>

              <div>
                <p className="section-title">Profile</p>
                {Object.keys(settingsDraft.profiles.available || {}).length === 0 ? (
                  <p className="text-sm text-[var(--ink-muted)]">No launcher profiles available.</p>
                ) : (
                  <label className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                    <span>Active profile</span>
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={settingsDraft.profiles.active}
                      onChange={(event) => updateProfileDraft(event.target.value)}
                    >
                      {Object.entries(settingsDraft.profiles.available).map(([key, profile]) => (
                        <option key={key} value={key}>
                          {profile.label || key}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div>
                <p className="section-title">Ports</p>
                <div className="mt-3 grid gap-4 md:grid-cols-3">
                  {(
                    [
                      ['backend', 'Backend'],
                      ['frontend', 'Frontend'],
                      ['game_frontend', 'Game UI'],
                      ['game_service', 'Game Service'],
                      ['devtools', 'DevTools'],
                      ['admin', 'Admin'],
                      ['launcher', 'Launcher API'],
                      ['generation_api', 'Generation API'],
                      ['postgres', 'Postgres'],
                      ['redis', 'Redis'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                      <span>{label} port</span>
                      <input
                        type="number"
                        className="input-field"
                        value={settingsDraft.ports[key]}
                        onChange={(event) => updatePortsDraft(key, Number(event.target.value))}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="section-title">Base URLs</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  {(
                    [
                      ['backend', 'Backend'],
                      ['generation', 'Generation'],
                      ['frontend', 'Frontend'],
                      ['game_frontend', 'Game UI'],
                      ['devtools', 'DevTools'],
                      ['admin', 'Admin'],
                      ['launcher', 'Launcher API'],
                      ['analysis', 'Analysis'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                      <span>{label} base URL</span>
                      <input
                        type="text"
                        className="input-field"
                        value={settingsDraft.base_urls[key]}
                        onChange={(event) => updateBaseUrlDraft(key, event.target.value)}
                        placeholder={`http://localhost:${settingsDraft.ports.backend}`}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="section-title">Advanced overrides</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  {(
                    [
                      ['database_url', 'DATABASE_URL'],
                      ['redis_url', 'REDIS_URL'],
                      ['secret_key', 'SECRET_KEY'],
                      ['cors_origins', 'CORS_ORIGINS'],
                      ['debug', 'DEBUG'],
                      ['service_base_urls', 'PIXSIM_SERVICE_BASE_URLS'],
                      ['service_timeouts', 'PIXSIM_SERVICE_TIMEOUTS'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                      <span>{label}</span>
                      <input
                        type="text"
                        className="input-field"
                        value={settingsDraft.advanced[key]}
                        onChange={(event) => updateAdvancedDraft(key, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </div>
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

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAdminContext } from '../adminContext';

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

type StatusFilter = (typeof STATUS_FILTERS)[number]['id'];

export function ServicesPanel() {
  const {
    services,
    servicesState,
    servicesError,
    refreshServices,
    startService,
    stopService,
    restartService,
    startAllServices,
    stopAllServices,
    lastServicesRefresh,
    serviceDefinitions,
    serviceDefinitionState,
    serviceDefinitionErrors,
    refreshServiceDefinition,
    selectedServiceKey,
    setSelectedServiceKey,
  } = useAdminContext();

  const [serviceQuery, setServiceQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [serviceDetailsOpen, setServiceDetailsOpen] = useState<Record<string, boolean>>({});
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);

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

  const refreshLabel = lastServicesRefresh
    ? `Last sync ${lastServicesRefresh.toLocaleTimeString()}`
    : 'No recent sync';

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }
    const interval = setInterval(refreshServices, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, refreshServices]);

  const handleToggleServiceDetails = useCallback(async (serviceKey: string) => {
    const nextState = !serviceDetailsOpen[serviceKey];
    setServiceDetailsOpen((prev) => ({ ...prev, [serviceKey]: nextState }));
    if (nextState && !serviceDefinitions[serviceKey] && serviceDefinitionState[serviceKey] !== 'loading') {
      await refreshServiceDefinition(serviceKey);
    }
  }, [refreshServiceDefinition, serviceDefinitionState, serviceDefinitions, serviceDetailsOpen]);

  return (
    <div className="panel-card h-full flex flex-col gap-4">
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
          <button className="action-button" onClick={startAllServices}>
            Start all
          </button>
          <button className="ghost-button" onClick={stopAllServices}>
            Stop all
          </button>
          <button className="ghost-button" onClick={refreshServices}>
            Refresh
          </button>
        </div>
      </div>
      {servicesError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {servicesError}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
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
      <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {servicesState === 'loading' && services.length === 0 ? (
          <div className="text-sm text-[var(--ink-muted)]">Loading services...</div>
        ) : filteredServices.length === 0 ? (
          <div className="text-sm text-[var(--ink-muted)]">No services match the current filters.</div>
        ) : (
          filteredServices.map((service) => {
            const isSelected = selectedServiceKey === service.key;
            return (
              <div
                key={service.key}
                className={`rounded-2xl border border-slate-200 bg-white/80 p-4 transition ${
                  isSelected ? 'ring-2 ring-[var(--tide-bright)]' : ''
                }`}
                onClick={() => setSelectedServiceKey(service.key)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    setSelectedServiceKey(service.key);
                  }
                }}
              >
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
                        onClick={(event) => {
                          event.stopPropagation();
                          stopService(service.key);
                        }}
                      >
                        Stop
                      </button>
                      <button
                        className="action-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          restartService(service.key);
                        }}
                      >
                        Restart
                      </button>
                    </>
                  ) : (
                    <button
                      className="action-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        startService(service.key);
                      }}
                    >
                      Start
                    </button>
                  )}
                  <button
                    className="ghost-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedServiceKey(service.key);
                    }}
                  >
                    Focus
                  </button>
                  <button
                    className="ghost-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleToggleServiceDetails(service.key);
                    }}
                  >
                    {serviceDetailsOpen[service.key] ? 'Hide details' : 'Details'}
                  </button>
                </div>
                {serviceDetailsOpen[service.key] ? (
                  <div className="detail-card">
                    {serviceDefinitionState[service.key] === 'loading' ? (
                      <div className="text-xs text-[var(--ink-muted)]">Loading definition...</div>
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
            );
          })
        )}
      </div>
    </div>
  );
}

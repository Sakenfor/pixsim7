import { useEffect, useMemo } from 'react';

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

export function ServiceInspectorPanel() {
  const {
    services,
    selectedServiceKey,
    startService,
    stopService,
    restartService,
    serviceDefinitions,
    serviceDefinitionState,
    serviceDefinitionErrors,
    refreshServiceDefinition,
  } = useAdminContext();

  const selectedService = useMemo(
    () => services.find((service) => service.key === selectedServiceKey) ?? null,
    [selectedServiceKey, services],
  );

  useEffect(() => {
    if (!selectedServiceKey) {
      return;
    }
    if (!serviceDefinitions[selectedServiceKey] && serviceDefinitionState[selectedServiceKey] !== 'loading') {
      void refreshServiceDefinition(selectedServiceKey);
    }
  }, [refreshServiceDefinition, selectedServiceKey, serviceDefinitionState, serviceDefinitions]);

  if (!selectedServiceKey || !selectedService) {
    return (
      <div className="panel-card h-full flex items-center justify-center">
        <div className="text-sm text-[var(--ink-muted)]">Select a service to inspect details.</div>
      </div>
    );
  }

  const definition = serviceDefinitions[selectedServiceKey];
  const definitionState = serviceDefinitionState[selectedServiceKey];
  const definitionError = serviceDefinitionErrors[selectedServiceKey];

  return (
    <div className="panel-card h-full flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="section-title">Service focus</p>
          <h2 className="text-2xl font-semibold">{selectedService.title}</h2>
          <p className="text-xs text-[var(--ink-muted)]">{selectedService.key}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedService.status === 'running' || selectedService.status === 'starting' ? (
            <>
              <button className="ghost-button" onClick={() => stopService(selectedService.key)}>
                Stop
              </button>
              <button className="action-button" onClick={() => restartService(selectedService.key)}>
                Restart
              </button>
            </>
          ) : (
            <button className="action-button" onClick={() => startService(selectedService.key)}>
              Start
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={`rounded-full px-3 py-1 text-xs uppercase ${STATUS_STYLES[selectedService.status]}`}>
          {selectedService.status}
        </span>
        <span className={`font-semibold ${HEALTH_STYLES[selectedService.health]}`}>{selectedService.health}</span>
        {selectedService.pid ? <span className="text-xs text-[var(--ink-muted)]">pid {selectedService.pid}</span> : null}
      </div>

      {selectedService.last_error ? (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {selectedService.last_error}
        </div>
      ) : null}
      {!selectedService.tool_available ? (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {selectedService.tool_check_message || 'Missing tool'}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="section-title">Definition</p>
        <button className="ghost-button" onClick={() => refreshServiceDefinition(selectedService.key)}>
          Refresh
        </button>
      </div>

      {definitionState === 'loading' ? (
        <div className="text-sm text-[var(--ink-muted)]">Loading definition...</div>
      ) : definitionError ? (
        <div className="text-sm text-rose-700">{definitionError}</div>
      ) : definition ? (
        <div className="detail-grid">
          <div>
            <p className="detail-label">Command</p>
            <div className="mono-chip mt-2">
              {definition.program} {definition.args.join(' ')}
            </div>
          </div>
          <div>
            <p className="detail-label">Working directory</p>
            <p className="detail-value">{definition.cwd}</p>
          </div>
          {definition.required_tool ? (
            <div>
              <p className="detail-label">Required tool</p>
              <p className="detail-value">{definition.required_tool}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {definition.url ? (
              <a className="link-chip" href={definition.url} target="_blank" rel="noreferrer">
                Open service
              </a>
            ) : null}
            {definition.health_url ? (
              <a className="link-chip" href={definition.health_url} target="_blank" rel="noreferrer">
                Health check
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="text-sm text-[var(--ink-muted)]">No definition available.</div>
      )}
    </div>
  );
}

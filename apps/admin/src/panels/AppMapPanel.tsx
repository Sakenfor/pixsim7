import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAdminContext } from '../adminContext';
import { runCodegenTask } from '../lib/api';

type LoadState = 'idle' | 'loading' | 'error';

type FrontendFeatureEntry = {
  id: string;
  label?: string;
  routes?: string[];
  frontend?: string[];
  backend?: string[];
  docs?: string[];
  notes?: string[];
  sources?: string[];
};

type UnifiedArchitectureResponse = {
  version: string;
  backend: {
    routes: { path: string }[];
    capabilities: unknown[];
    services: unknown[];
    plugins: unknown[];
  };
  frontend: {
    generatedAt: string | null;
    entries: FrontendFeatureEntry[];
    error?: string;
  };
  metrics?: {
    total_routes?: number;
    total_services?: number;
    total_plugins?: number;
    total_frontend_features?: number;
    frontend_generated_at?: string | null;
  };
};

function normalizeApiBase(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }
  if (/\/api(\/v\d+)?$/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/api/v1`;
}

function normalizeBaseUrl(baseUrl: string): string | null {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

function formatCount(value: number | undefined, fallback: number) {
  if (typeof value === 'number') {
    return value;
  }
  return fallback;
}

export function AppMapPanel() {
  const { settings, settingsState, settingsError, refreshSettings, copyCommand } = useAdminContext();
  const [archState, setArchState] = useState<LoadState>('idle');
  const [archError, setArchError] = useState('');
  const [query, setQuery] = useState('');
  const [architecture, setArchitecture] = useState<UnifiedArchitectureResponse | null>(null);
  const [runState, setRunState] = useState<LoadState>('idle');
  const [runOutput, setRunOutput] = useState('');
  const [runError, setRunError] = useState('');

  const backendBase = settings?.base_urls?.backend || '';
  const frontendBase = settings?.base_urls?.frontend || '';
  const docsBase = settings?.base_urls?.docs || '';
  const apiBase = useMemo(() => normalizeApiBase(backendBase), [backendBase]);
  const appMapBase = useMemo(() => normalizeBaseUrl(frontendBase), [frontendBase]);
  const docsUrl = useMemo(() => normalizeBaseUrl(docsBase), [docsBase]);
  const appMapUrl = appMapBase ? `${appMapBase}/app-map` : null;

  const fetchArchitecture = useCallback(async () => {
    if (!apiBase) {
      setArchError('Backend base URL is not configured. Check launcher settings.');
      setArchState('error');
      return;
    }
    setArchState('loading');
    setArchError('');
    try {
      const response = await fetch(`${apiBase}/dev/architecture/unified`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(error.error || error.detail || 'Failed to load architecture map');
      }
      const data = (await response.json()) as UnifiedArchitectureResponse;
      setArchitecture(data);
      setArchState('idle');
    } catch (error) {
      setArchError(error instanceof Error ? error.message : 'Failed to load architecture map');
      setArchState('error');
    }
  }, [apiBase]);

  const runAppMapCodegen = useCallback(
    async (checkMode: boolean) => {
      setRunState('loading');
      setRunError('');
      setRunOutput('');
      try {
        const response = await runCodegenTask({ task_id: 'app-map', check: checkMode });
        const status = response.ok ? 'OK' : 'FAILED';
        const summary = [
          `Task: ${response.task_id}`,
          `Status: ${status}`,
          response.exit_code !== null ? `Exit code: ${response.exit_code}` : 'Exit code: -',
          `Duration: ${(response.duration_ms / 1000).toFixed(1)}s`,
        ].join('\n');
        const stdout = response.stdout?.trim();
        const stderr = response.stderr?.trim();
        const sections = [
          summary,
          stdout ? `\n--- stdout ---\n${stdout}` : '',
          stderr ? `\n--- stderr ---\n${stderr}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        setRunOutput(sections);
        setRunState('idle');
        if (response.ok) {
          void fetchArchitecture();
        }
      } catch (error) {
        setRunError(error instanceof Error ? error.message : 'Failed to run app map codegen');
        setRunState('error');
      }
    },
    [fetchArchitecture],
  );

  useEffect(() => {
    if (settingsState === 'idle') {
      void fetchArchitecture();
    }
  }, [fetchArchitecture, settingsState]);

  const entries = architecture?.frontend.entries ?? [];
  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return entries;
    }
    return entries.filter((entry) => {
      const haystack = [
        entry.id,
        entry.label,
        ...(entry.routes ?? []),
        ...(entry.docs ?? []),
        ...(entry.backend ?? []),
        ...(entry.frontend ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, query]);

  const backendCounts = architecture?.backend ?? {
    routes: [],
    services: [],
    plugins: [],
    capabilities: [],
  };

  const totalRoutes = formatCount(architecture?.metrics?.total_routes, backendCounts.routes.length);
  const totalServices = formatCount(architecture?.metrics?.total_services, backendCounts.services.length);
  const totalPlugins = formatCount(architecture?.metrics?.total_plugins, backendCounts.plugins.length);
  const totalFrontend = formatCount(architecture?.metrics?.total_frontend_features, entries.length);
  const generatedAt =
    architecture?.metrics?.frontend_generated_at || architecture?.frontend.generatedAt || null;

  return (
    <div className="panel-card h-full flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="section-title">App Map</p>
          <h2 className="text-2xl font-semibold">Architecture snapshot</h2>
          <p className="text-sm text-[var(--ink-muted)]">
            Live view of frontend modules and backend services from the unified architecture API.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="ghost-button" onClick={refreshSettings}>
            Refresh settings
          </button>
          <button className="action-button" onClick={() => void fetchArchitecture()}>
            Refresh map
          </button>
          <button className="ghost-button" onClick={() => void runAppMapCodegen(false)}>
            Regenerate App Map
          </button>
          <button className="ghost-button" onClick={() => void runAppMapCodegen(true)}>
            Check App Map
          </button>
          <button
            className="ghost-button"
            onClick={() => copyCommand('pnpm', ['codegen', '--', '--only', 'app-map'])}
          >
            Copy run command
          </button>
          <button
            className="ghost-button"
            onClick={() => copyCommand('pnpm', ['codegen', '--', '--only', 'app-map', '--check'])}
          >
            Copy check command
          </button>
          {appMapUrl ? (
            <a className="ghost-button" href={appMapUrl} target="_blank" rel="noreferrer">
              Open App Map UI
            </a>
          ) : null}
          {docsUrl ? (
            <a className="ghost-button" href={docsUrl} target="_blank" rel="noreferrer">
              Open Docs
            </a>
          ) : null}
        </div>
      </div>

      {settingsError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {settingsError}
        </div>
      ) : null}

      {archError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {archError}
        </div>
      ) : null}

      {runError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {runError}
        </div>
      ) : null}

      {architecture?.frontend.error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {architecture.frontend.error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <span className="status-pill">Routes: {totalRoutes}</span>
        <span className="status-pill">Services: {totalServices}</span>
        <span className="status-pill">Plugins: {totalPlugins}</span>
        <span className="status-pill">Frontend features: {totalFrontend}</span>
        {generatedAt ? <span className="text-xs text-[var(--ink-muted)]">Generated {generatedAt}</span> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <input
            className="input-field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search features by name, route, or file"
          />
        </div>
        <div className="text-xs text-[var(--ink-muted)]">
          API base: {apiBase || 'Not configured'}
        </div>
      </div>

      <div className="stagger grid gap-4">
        {archState === 'loading' && entries.length === 0 ? (
          <div className="text-sm text-[var(--ink-muted)]">Loading architecture map...</div>
        ) : runState === 'loading' ? (
          <div className="text-sm text-[var(--ink-muted)]">Running app map codegen...</div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-sm text-[var(--ink-muted)]">No features match the current search.</div>
        ) : (
          filteredEntries.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{entry.label || entry.id}</h3>
                  <p className="text-xs text-[var(--ink-muted)]">{entry.id}</p>
                </div>
                {entry.routes?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {entry.routes.map((route) => (
                      <span key={route} className="mono-chip">
                        {route}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="detail-label">Docs</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {entry.docs?.length ? (
                      entry.docs.map((doc) => (
                        <span key={doc} className="mono-chip">
                          {doc}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-[var(--ink-muted)]">-</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="detail-label">Backend</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {entry.backend?.length ? (
                      entry.backend.map((backend) => (
                        <span key={backend} className="mono-chip">
                          {backend}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-[var(--ink-muted)]">-</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="detail-label">Frontend</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {entry.frontend?.length ? (
                      entry.frontend.map((front) => (
                        <span key={front} className="mono-chip">
                          {front}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-[var(--ink-muted)]">-</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="detail-label">Notes</p>
                  <div className="mt-2 text-xs text-[var(--ink-muted)]">
                    {entry.notes?.length ? entry.notes.join(' ') : '-'}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {runOutput ? (
        <div className="detail-card">
          <p className="detail-label">Codegen Output</p>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-[var(--ink)]">{runOutput}</pre>
        </div>
      ) : null}
    </div>
  );
}

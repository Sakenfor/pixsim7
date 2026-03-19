import { PanelShell, SidebarPaneShell, HierarchicalSidebarNav } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { canRunCodegen } from '@lib/auth';


import {
  extractErrorMessage,
  runTestProfile,
  type TestRunResponse,
} from '@features/devtools/services/testExecutionApi';
import {
  clearTestRunSnapshots,
  getTestOverview,
  listTestRunSnapshots,
  recordTestRunSnapshot,
  type TestProfileDefinition,
  type TestSuiteDefinition,
  type TestRunSnapshot,
  type TestRunStatus,
} from '@features/devtools/services/testOverviewService';
import { fetchTestRuns, fetchTestCatalog, type TestRunRecord, type CatalogSuiteRecord } from '@features/devtools/services/testRunsApi';

import { useAuthStore } from '@/stores/authStore';

import { TestAnalyticsGraphs } from './TestAnalyticsGraphs';

type TestOverviewSection = 'run' | 'catalog' | 'history' | 'reports';

interface SuiteSubcategoryGroup {
  key: string;
  label: string;
  suites: TestSuiteDefinition[];
}

interface SuiteCategoryGroup {
  key: string;
  label: string;
  suiteCount: number;
  subcategories: SuiteSubcategoryGroup[];
}

interface SuiteLayerGroup {
  key: TestSuiteDefinition['layer'];
  label: string;
  suiteCount: number;
  categories: SuiteCategoryGroup[];
}

const LAYER_ORDER: TestSuiteDefinition['layer'][] = ['backend', 'frontend', 'scripts'];

function humanizeSlug(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function categoryLabel(value?: string): string {
  if (!value) {
    return 'Uncategorized';
  }
  return value
    .split('/')
    .filter(Boolean)
    .map(humanizeSlug)
    .join(' / ');
}

function subcategoryLabel(value?: string): string {
  if (!value) {
    return 'General';
  }
  return humanizeSlug(value);
}

function layerLabel(layer: TestSuiteDefinition['layer']): string {
  return humanizeSlug(layer);
}

function buildSuiteCatalog(suites: TestSuiteDefinition[]): SuiteLayerGroup[] {
  const layerBuckets = new Map<TestSuiteDefinition['layer'], TestSuiteDefinition[]>();
  for (const suite of suites) {
    const list = layerBuckets.get(suite.layer) ?? [];
    list.push(suite);
    layerBuckets.set(suite.layer, list);
  }

  const orderedLayerKeys = [...layerBuckets.keys()].sort((a, b) => {
    const aIndex = LAYER_ORDER.indexOf(a);
    const bIndex = LAYER_ORDER.indexOf(b);
    if (aIndex === -1 && bIndex === -1) {
      return a.localeCompare(b);
    }
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return orderedLayerKeys.map((layerKey) => {
    const layerSuites = [...(layerBuckets.get(layerKey) ?? [])];
    const categoryBuckets = new Map<string, TestSuiteDefinition[]>();
    for (const suite of layerSuites) {
      const categoryKey = suite.category ?? '__uncategorized__';
      const list = categoryBuckets.get(categoryKey) ?? [];
      list.push(suite);
      categoryBuckets.set(categoryKey, list);
    }

    const categories = [...categoryBuckets.entries()]
      .map(([categoryKey, categorySuites]): SuiteCategoryGroup => {
        const subcategoryBuckets = new Map<string, TestSuiteDefinition[]>();
        for (const suite of categorySuites) {
          const subcategoryKey = suite.subcategory ?? '__general__';
          const list = subcategoryBuckets.get(subcategoryKey) ?? [];
          list.push(suite);
          subcategoryBuckets.set(subcategoryKey, list);
        }

        const subcategories = [...subcategoryBuckets.entries()]
          .map(([subcategoryKey, subcategorySuites]): SuiteSubcategoryGroup => {
            const sortedSuites = [...subcategorySuites].sort((a, b) => a.label.localeCompare(b.label));
            return {
              key: subcategoryKey,
              label: subcategoryKey === '__general__' ? 'General' : subcategoryLabel(subcategoryKey),
              suites: sortedSuites,
            };
          })
          .sort((a, b) => a.label.localeCompare(b.label));

        return {
          key: categoryKey,
          label: categoryKey === '__uncategorized__' ? 'Uncategorized' : categoryLabel(categoryKey),
          suiteCount: categorySuites.length,
          subcategories,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      key: layerKey,
      label: layerLabel(layerKey),
      suiteCount: layerSuites.length,
      categories,
    };
  });
}

function statusClasses(status: TestRunStatus): string {
  if (status === 'passed') {
    return 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300';
  }
  if (status === 'failed') {
    return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300';
  }
  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300';
}

function formatRunTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

function layerClasses(layer: string): string {
  if (layer === 'backend') {
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300';
  }
  if (layer === 'frontend') {
    return 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300';
  }
  return 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300';
}

function renderSuiteMetaPills(
  suite: TestSuiteDefinition,
  options: { hideCategory?: boolean; hideSubcategory?: boolean } = {},
) {
  const pillClassName =
    'px-2 py-0.5 rounded text-[10px] font-medium bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300';
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {!options.hideCategory && suite.category && <span className={pillClassName}>{suite.category}</span>}
      {!options.hideSubcategory && suite.subcategory && (
        <span className={pillClassName}>{suite.subcategory}</span>
      )}
      {suite.kind && <span className={pillClassName}>{suite.kind}</span>}
      {suite.covers && suite.covers.length > 0 && (
        <span className={pillClassName} title={suite.covers.join(', ')}>
          covers {suite.covers.length}
        </span>
      )}
    </div>
  );
}

function formatRunOutput(result: TestRunResponse): string {
  const scope = result.backend_only
    ? 'backend-only'
    : result.frontend_only
      ? 'frontend-only'
      : 'backend+frontend';

  const summary = [
    `Profile: ${result.profile}`,
    `Scope: ${scope}`,
    `Status: ${result.ok ? 'passed' : 'failed'}`,
    result.exit_code !== null ? `Exit code: ${result.exit_code}` : 'Exit code: -',
    `Duration: ${(result.duration_ms / 1000).toFixed(1)}s`,
  ].join('\n');

  const stdout = result.stdout?.trim();
  const stderr = result.stderr?.trim();

  return [
    summary,
    stdout ? `\n--- stdout ---\n${stdout}` : '',
    stderr ? `\n--- stderr ---\n${stderr}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}


interface ProfileCardProps {
  profile: TestProfileDefinition;
  onCopy: (profile: TestProfileDefinition) => Promise<void>;
  onRecord: (profileId: TestProfileDefinition['id'], status: TestRunStatus) => void;
  onRun: (profile: TestProfileDefinition) => Promise<void>;
  canExecute: boolean;
  running: boolean;
  copied: boolean;
}

function ProfileCard({
  profile,
  onCopy,
  onRecord,
  onRun,
  canExecute,
  running,
  copied,
}: ProfileCardProps) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {profile.label}
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            {profile.description}
          </p>
        </div>
        <code className="text-[11px] px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700">
          {profile.command}
        </code>
      </div>

      <div className="flex flex-wrap gap-2">
        {profile.tags.map((tag) => (
          <span
            key={tag}
            className="px-2 py-0.5 rounded text-[11px] bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {canExecute && (
          <button
            onClick={() => void onRun(profile)}
            disabled={running}
            className="px-2.5 py-1.5 text-xs font-medium rounded bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 transition-colors"
          >
            {running ? 'Running...' : 'Run now'}
          </button>
        )}
        <button
          onClick={() => void onCopy(profile)}
          className="px-2.5 py-1.5 text-xs font-medium rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
        >
          {copied ? 'Copied' : 'Copy command'}
        </button>
        <button
          onClick={() => onRecord(profile.id, 'passed')}
          className="px-2.5 py-1.5 text-xs font-medium rounded bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300 hover:opacity-90"
        >
          Mark passed
        </button>
        <button
          onClick={() => onRecord(profile.id, 'failed')}
          className="px-2.5 py-1.5 text-xs font-medium rounded bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300 hover:opacity-90"
        >
          Mark failed
        </button>
        <button
          onClick={() => onRecord(profile.id, 'skipped')}
          className="px-2.5 py-1.5 text-xs font-medium rounded bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 hover:opacity-90"
        >
          Mark skipped
        </button>
      </div>
    </div>
  );
}

function serverRunStatusClasses(status: string): string {
  if (status === 'pass') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300';
  if (status === 'fail') return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300';
  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300';
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ServerRunRow({ run }: { run: TestRunRecord }) {
  const [expanded, setExpanded] = useState(false);
  const summary = run.summary ?? {};
  const metrics = (summary.metrics ?? {}) as Record<string, number>;
  const failures = (summary.failures ?? []) as Array<{ test: string; reason: string }>;
  const hasDetails = Object.keys(metrics).length > 0 || failures.length > 0;

  return (
    <div className="px-3 py-2.5">
      <button
        type="button"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
        disabled={!hasDetails}
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{run.suite_id}</div>
          <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
            {formatRunTime(run.started_at)}
            {run.duration_ms != null && (
              <span className="text-neutral-400 dark:text-neutral-500">
                {formatDuration(run.duration_ms)}
              </span>
            )}
            {typeof summary.total === 'number' && (
              <span>
                {summary.passed ?? 0}/{summary.total} passed
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${serverRunStatusClasses(run.status)}`}>
            {run.status}
          </span>
          {hasDetails && (
            <span className="text-[10px] text-neutral-400">{expanded ? '▾' : '▸'}</span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-2 pl-1 space-y-1.5">
          {Object.keys(metrics).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(metrics).map(([key, value]) => (
                <span
                  key={key}
                  className="px-2 py-0.5 rounded text-[11px] bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 font-mono"
                >
                  {key}: {typeof value === 'number' && value < 1 ? `${(value * 100).toFixed(1)}%` : value}
                </span>
              ))}
            </div>
          )}
          {failures.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] text-red-400 uppercase tracking-wider">
                Failures ({failures.length})
              </div>
              {failures.slice(0, 5).map((f, i) => (
                <div key={i} className="text-[11px] text-neutral-400 dark:text-neutral-500 pl-2 border-l-2 border-red-800/30">
                  <span className="font-mono text-neutral-300">{f.test}</span>
                  {f.reason && <span className="text-neutral-500"> — {f.reason}</span>}
                </div>
              ))}
              {failures.length > 5 && (
                <div className="text-[10px] text-neutral-500 pl-2">+{failures.length - 5} more</div>
              )}
            </div>
          )}
          {run.environment && (
            <div className="flex flex-wrap gap-2 text-[10px] text-neutral-500">
              {Object.entries(run.environment).map(([k, v]) => (
                <span key={k} className="font-mono">{k}: {String(v)}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TestOverviewPanel() {
  const overview = useMemo(() => getTestOverview(), []);
  const user = useAuthStore((state) => state.user);
  const canExecute = canRunCodegen(user);
  const [runs, setRuns] = useState<TestRunSnapshot[]>(() => listTestRunSnapshots(60));
  const [activeSection, setActiveSection] = useState<TestOverviewSection>('run');
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [runningProfileId, setRunningProfileId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string>('');
  const [runOutput, setRunOutput] = useState<string>('');
  const [serverRuns, setServerRuns] = useState<TestRunRecord[]>([]);
  const [serverRunsLoading, setServerRunsLoading] = useState(false);
  const [backendSuites, setBackendSuites] = useState<CatalogSuiteRecord[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [historySuiteFilter, setHistorySuiteFilter] = useState<string | null>(null);

  const loadServerRuns = useCallback(async () => {
    setServerRunsLoading(true);
    try {
      const result = await fetchTestRuns({ limit: 50 });
      setServerRuns(result);
    } catch {
      // Silently fail — server runs are supplementary
    } finally {
      setServerRunsLoading(false);
    }
  }, []);

  // Load server runs on mount (for sidebar count) and when visiting catalog/history
  useEffect(() => {
    void loadServerRuns();
    void fetchTestCatalog().then(setBackendSuites).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeSection === 'history' || activeSection === 'catalog') {
      void loadServerRuns();
    }
  }, [activeSection, loadServerRuns]);

  // Latest run status per suite — for catalog health badges
  const suiteHealthMap = useMemo(() => {
    const map = new Map<string, { status: string; started_at: string }>();
    // Server runs are sorted by started_at desc, so first occurrence is latest
    for (const run of serverRuns) {
      if (!map.has(run.suite_id)) {
        map.set(run.suite_id, { status: run.status, started_at: run.started_at });
      }
    }
    return map;
  }, [serverRuns]);

  // Server runs filtered by suite when drill-through is active
  const filteredServerRuns = useMemo(() => {
    if (!historySuiteFilter) return serverRuns;
    return serverRuns.filter((r) => r.suite_id === historySuiteFilter);
  }, [serverRuns, historySuiteFilter]);

  const lastRun = runs[0] ?? null;

  // Merge local (TS-registered) suites with backend-discovered suites, dedup by ID
  const allSuites = useMemo<TestSuiteDefinition[]>(() => {
    const seen = new Set<string>();
    const merged: TestSuiteDefinition[] = [];
    for (const suite of overview.suites) {
      if (!seen.has(suite.id)) {
        seen.add(suite.id);
        merged.push(suite);
      }
    }
    for (const bs of backendSuites) {
      if (!seen.has(bs.id)) {
        seen.add(bs.id);
        merged.push({
          id: bs.id,
          label: bs.label,
          path: bs.path,
          layer: bs.layer,
          kind: (bs.kind ?? 'unit') as TestSuiteDefinition['kind'],
          category: bs.category ?? undefined,
          subcategory: bs.subcategory ?? undefined,
          covers: bs.covers,
          order: bs.order ?? undefined,
        });
      }
    }
    return merged;
  }, [overview.suites, backendSuites]);

  const suiteCatalog = useMemo(() => buildSuiteCatalog(allSuites), [allSuites]);

  // Filtered catalog for search
  const filteredSuiteCatalog = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) return suiteCatalog;
    return suiteCatalog
      .map((layer) => ({
        ...layer,
        categories: layer.categories
          .map((cat) => ({
            ...cat,
            subcategories: cat.subcategories
              .map((sub) => ({
                ...sub,
                suites: sub.suites.filter((suite) =>
                  suite.label.toLowerCase().includes(query) ||
                  suite.id.toLowerCase().includes(query) ||
                  (suite.path ?? '').toLowerCase().includes(query)
                ),
              }))
              .filter((sub) => sub.suites.length > 0),
          }))
          .filter((cat) => cat.subcategories.length > 0),
      }))
      .filter((layer) => layer.categories.length > 0);
  }, [suiteCatalog, catalogSearch]);
  const docsByKind = useMemo(() => {
    const reports = overview.docs.filter((path) => {
      return path.includes('/plans/') || path.includes('\\plans\\') || path.includes('eval_');
    });
    const references = overview.docs.filter((path) => !reports.includes(path));
    return { reports, references };
  }, [overview.docs]);

  const handleCopyCommand = async (profile: TestProfileDefinition) => {
    try {
      await navigator.clipboard.writeText(profile.command);
      setCopiedCommand(profile.id);
      window.setTimeout(() => {
        setCopiedCommand((current) => (current === profile.id ? null : current));
      }, 1300);
    } catch {
      // Clipboard may be unavailable in restrictive browser contexts.
      setCopiedCommand(null);
    }
  };

  const handleRecordRun = (profileId: TestProfileDefinition['id'], status: TestRunStatus) => {
    recordTestRunSnapshot(profileId, status);
    setRuns(listTestRunSnapshots(60));
  };

  const handleDrillToSuiteHistory = (suiteId: string) => {
    setHistorySuiteFilter(suiteId);
    setActiveSection('history');
  };

  const handleRunProfile = async (profile: TestProfileDefinition) => {
    setRunningProfileId(profile.id);
    setRunError('');
    setRunOutput('');
    try {
      const result = await runTestProfile(profile.runRequest);
      setRunOutput(formatRunOutput(result));
      handleRecordRun(profile.id, result.ok ? 'passed' : 'failed');
    } catch (error) {
      setRunError(extractErrorMessage(error) || 'Failed to run test profile');
      handleRecordRun(profile.id, 'failed');
    } finally {
      setRunningProfileId(null);
    }
  };

  const handleClearHistory = () => {
    clearTestRunSnapshots();
    setRuns([]);
  };

  return (
    <PanelShell
      className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
      sidebar={
        <SidebarPaneShell widthClassName="w-full" title="Test Overview" variant="light" collapsible expandedWidth={176} persistKey="test-overview-sidebar">
          <HierarchicalSidebarNav
            items={[
              { id: 'run', label: `Run (${overview.profiles.length})` },
              { id: 'catalog', label: `Catalog (${allSuites.length})` },
              { id: 'history', label: `History (${runs.length + serverRuns.length})` },
              { id: 'reports', label: `Reports (${docsByKind.reports.length})` },
            ]}
            onSelectItem={(id) => setActiveSection(id as TestOverviewSection)}
            getItemState={(item) => (item.id === activeSection ? 'active' : 'inactive')}
            variant="light"
          />
          <div className="mt-4 border-t border-neutral-200 dark:border-neutral-800 pt-3 px-1 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 font-medium px-2">
              Summary
            </div>
            <div className="px-2 py-1 text-xs">
              <span className="text-neutral-500 dark:text-neutral-400">Profiles</span>
              <span className="ml-auto float-right font-semibold">{overview.profiles.length}</span>
            </div>
            <div className="px-2 py-1 text-xs">
              <span className="text-neutral-500 dark:text-neutral-400">Suites</span>
              <span className="ml-auto float-right font-semibold">{allSuites.length}</span>
            </div>
            {suiteHealthMap.size > 0 && (() => {
              const passing = [...suiteHealthMap.values()].filter((h) => h.status === 'pass').length;
              const failing = [...suiteHealthMap.values()].filter((h) => h.status === 'fail').length;
              const errored = suiteHealthMap.size - passing - failing;
              return (
                <div className="px-2 py-1 text-xs space-y-1">
                  <div className="text-neutral-500 dark:text-neutral-400">Health</div>
                  <div className="flex items-center gap-2 mt-1">
                    {passing > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-[11px] font-medium">{passing}</span>
                      </span>
                    )}
                    {failing > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="text-[11px] font-medium">{failing}</span>
                      </span>
                    )}
                    {errored > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-[11px] font-medium">{errored}</span>
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-neutral-300 dark:bg-neutral-700" />
                      <span className="text-[11px] font-medium">{allSuites.length - suiteHealthMap.size}</span>
                    </span>
                  </div>
                </div>
              );
            })()}
            {(lastRun || serverRuns.length > 0) && (
              <div className="px-2 py-1 text-xs">
                <div className="text-neutral-500 dark:text-neutral-400">Latest</div>
                <div className="mt-1 space-y-1">
                  {serverRuns[0] && (
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${serverRunStatusClasses(serverRuns[0].status)}`}>
                        {serverRuns[0].status}
                      </span>
                      <span className="text-[10px] text-neutral-400 truncate">{serverRuns[0].suite_id}</span>
                    </div>
                  )}
                  {lastRun && (
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusClasses(lastRun.status)}`}>
                        {lastRun.status}
                      </span>
                      <span className="text-[10px] text-neutral-400 truncate">{lastRun.profileLabel}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {!canExecute && (
              <div className="px-2 py-1 text-[10px] text-amber-600 dark:text-amber-400">
                Read-only mode
              </div>
            )}
          </div>
        </SidebarPaneShell>
      }
      sidebarWidth="w-44"
      bodyClassName="p-4 space-y-4"
    >

        {activeSection === 'run' && (
          <section className="space-y-3">
            {(runError || runOutput) && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Execution output</h3>
                {runError && (
                  <div className="px-3 py-2 text-sm rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
                    {runError}
                  </div>
                )}
                {runOutput && (
                  <pre className="p-3 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-xs overflow-auto whitespace-pre-wrap">
                    {runOutput}
                  </pre>
                )}
              </section>
            )}

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                Profiles (execution + manual status)
              </h3>
              {overview.profiles.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  onCopy={handleCopyCommand}
                  onRecord={handleRecordRun}
                  onRun={handleRunProfile}
                  canExecute={canExecute}
                  running={runningProfileId === profile.id}
                  copied={copiedCommand === profile.id}
                />
              ))}
            </div>
          </section>
        )}

        {activeSection === 'catalog' && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                Suite catalog by layer/category
              </h3>
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Filter suites..."
                className="px-2.5 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 placeholder:text-neutral-400 w-48 outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {filteredSuiteCatalog.length === 0 && catalogSearch.trim() && (
              <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-sm text-neutral-500 dark:text-neutral-400">
                No suites matching &ldquo;{catalogSearch.trim()}&rdquo;
              </div>
            )}
            {filteredSuiteCatalog.map((layer) => (
              <div
                key={layer.key}
                className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden"
              >
                <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${layerClasses(layer.key)}`}>
                      {layer.label}
                    </span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">{layer.suiteCount} suites</span>
                  </div>
                </div>
                <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {layer.categories.map((category) => (
                    <div key={`${layer.key}:${category.key}`} className="px-3 py-2.5">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                          {category.label}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] text-neutral-600 dark:text-neutral-300">
                          {category.suiteCount}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {category.subcategories.map((subcategory) => (
                          <div
                            key={`${layer.key}:${category.key}:${subcategory.key}`}
                            className="rounded border border-neutral-200 dark:border-neutral-800"
                          >
                            <div className="px-2.5 py-1.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/40">
                              <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
                                {subcategory.label}
                              </span>
                            </div>
                            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                              {subcategory.suites.map((suite) => {
                                const health = suiteHealthMap.get(suite.id);
                                const suiteCommand = suite.layer === 'frontend'
                                  ? `pnpm vitest run ${suite.path}`
                                  : `python -m pytest ${suite.path} -q`;
                                return (
                                  <div
                                    key={suite.id}
                                    className="px-2.5 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                                  >
                                    <div className="flex items-center gap-2">
                                      {health && (
                                        <span
                                          className={`w-2 h-2 rounded-full shrink-0 ${
                                            health.status === 'pass'
                                              ? 'bg-green-500'
                                              : health.status === 'fail'
                                                ? 'bg-red-500'
                                                : 'bg-amber-500'
                                          }`}
                                          title={`Last run: ${health.status} (${formatRunTime(health.started_at)})`}
                                        />
                                      )}
                                      {!health && (
                                        <span
                                          className="w-2 h-2 rounded-full shrink-0 bg-neutral-300 dark:bg-neutral-700"
                                          title="No recorded runs"
                                        />
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleDrillToSuiteHistory(suite.id)}
                                        className="text-sm font-medium hover:text-blue-500 dark:hover:text-blue-400 transition-colors text-left"
                                      >
                                        {suite.label}
                                      </button>
                                    </div>
                                    <code className="text-[11px] text-neutral-500 dark:text-neutral-400">{suite.path}</code>
                                    <div className="flex items-center gap-2 mt-1.5">
                                      {renderSuiteMetaPills(suite, { hideCategory: true, hideSubcategory: true })}
                                      <div className="flex-1" />
                                      <button
                                        type="button"
                                        onClick={() => void navigator.clipboard.writeText(suiteCommand)}
                                        className="px-2 py-0.5 text-[10px] font-medium rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                                        title={suiteCommand}
                                      >
                                        Copy run cmd
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDrillToSuiteHistory(suite.id)}
                                        className="px-2 py-0.5 text-[10px] font-medium rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                                      >
                                        History
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {activeSection === 'history' && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Run history + analytics</h3>
              {historySuiteFilter && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Filtered: <span className="font-mono text-neutral-300">{historySuiteFilter}</span>
                  </span>
                  <button
                    onClick={() => setHistorySuiteFilter(null)}
                    className="px-2 py-0.5 text-[11px] font-medium rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
                  >
                    Clear filter
                  </button>
                </div>
              )}
            </div>
            {lastRun && (
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">Latest snapshot</div>
                  <div className="text-sm font-medium mt-0.5">{lastRun.profileLabel}</div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {formatRunTime(lastRun.createdAt)}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusClasses(lastRun.status)}`}>
                  {lastRun.status}
                </span>
              </div>
            )}

            <TestAnalyticsGraphs snapshots={runs} />

            {/* Server-persisted eval runs */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                Eval runs {filteredServerRuns.length > 0 && (
                  <span className="text-neutral-400 font-normal">
                    ({filteredServerRuns.length}{historySuiteFilter ? ` of ${serverRuns.length}` : ''})
                  </span>
                )}
              </h3>
              <button
                onClick={() => void loadServerRuns()}
                disabled={serverRunsLoading}
                className="px-2.5 py-1 text-xs font-medium rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50"
              >
                {serverRunsLoading ? '...' : 'Refresh'}
              </button>
            </div>
            {filteredServerRuns.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-sm text-neutral-500 dark:text-neutral-400">
                {serverRunsLoading ? 'Loading...' : historySuiteFilter ? `No runs for "${historySuiteFilter}".` : 'No eval runs recorded yet.'}
              </div>
            ) : (
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
                {filteredServerRuns.map((run) => (
                  <ServerRunRow key={run.id} run={run} />
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Local run history</h3>
              <button
                onClick={handleClearHistory}
                disabled={runs.length === 0}
                className="px-2.5 py-1 text-xs font-medium rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50"
              >
                Clear
              </button>
            </div>
            {runs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-sm text-neutral-500 dark:text-neutral-400">
                No snapshots yet. Use profile buttons to mark latest local run outcomes.
              </div>
            ) : (
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
                {runs.map((run) => (
                  <div key={run.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{run.profileLabel}</div>
                      <code className="text-[11px] text-neutral-500 dark:text-neutral-400">{run.command}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusClasses(run.status)}`}>
                        {run.status}
                      </span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                        {formatRunTime(run.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeSection === 'reports' && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Evaluation reports</h3>
            {docsByKind.reports.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-sm text-neutral-500 dark:text-neutral-400">
                No report docs registered.
              </div>
            ) : (
              <div className="space-y-1.5">
                {docsByKind.reports.map((docPath) => (
                  <code
                    key={docPath}
                    className="block text-[11px] px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300"
                  >
                    {docPath}
                  </code>
                ))}
              </div>
            )}

            <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Reference docs</h3>
            {docsByKind.references.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-sm text-neutral-500 dark:text-neutral-400">
                No reference docs registered.
              </div>
            ) : (
              <div className="space-y-1.5">
                {docsByKind.references.map((docPath) => (
                  <code
                    key={docPath}
                    className="block text-[11px] px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300"
                  >
                    {docPath}
                  </code>
                ))}
              </div>
            )}
          </section>
        )}
    </PanelShell>
  );
}

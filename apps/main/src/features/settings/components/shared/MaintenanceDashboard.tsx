/**
 * Maintenance Dashboard
 *
 * Information-dense panel showing system health, backfill progress for all
 * maintenance tasks, and expandable detail breakdowns.
 *
 * Rows:
 *  1. SHA256 Hashes       — hash coverage + backfill
 *  2. Content Storage     — old→new storage migration
 *  3. Content Links       — content-blob linkage
 *  4. Upload Method       — source-attribution coverage
 *  5. Folder Context      — local asset folder metadata backfill
 *  6. Thumbnails          — action-only (regenerate missing)
 */

import { Button } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import { authService } from '@lib/auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SHAStats {
  total_assets: number;
  with_sha: number;
  without_sha: number;
  without_sha_with_local: number;
  without_sha_no_local: number;
  percentage: number;
}

interface StorageSyncStats {
  total_assets: number;
  new_storage: number;
  old_storage: number;
  no_local: number;
  percentage: number;
}

interface ContentBlobStats {
  total_assets: number;
  with_content_id: number;
  missing_content_id: number;
  missing_with_sha: number;
  missing_logical_size: number;
  percentage: number;
}

interface UploadMethodStats {
  total_assets: number;
  with_upload_method: number;
  without_upload_method: number;
  by_method: Record<string, number>;
  percentage: number;
}

interface FolderContextStats {
  total_local: number;
  with_folder_context: number;
  without_folder_context: number;
  fixable_from_metadata: number;
  fixable_from_prefs: number;
  unfixable: number;
  percentage: number;
}

interface HealthStatus {
  status: 'healthy' | 'degraded';
  database: string;
  redis: string;
  providers: string[];
}

interface ActionResult {
  message: string;
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function apiBase() {
  return (import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
}

function authHeaders(): Record<string, string> {
  const token = authService.getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

function fmt(n: number) {
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin text-muted-foreground`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// System health header
// ---------------------------------------------------------------------------

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
  );
}

function HealthHeader() {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    apiFetch<HealthStatus>('/health').then(setHealth).catch(() => {});
  }, []);

  if (!health) return null;

  const dbOk = health.database === 'connected';
  const redisOk = health.redis === 'connected';

  return (
    <div className="flex items-center gap-4 px-3 py-2 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <StatusDot ok={dbOk} />
        <span>Database</span>
      </div>
      <div className="flex items-center gap-1.5">
        <StatusDot ok={redisOk} />
        <span>Redis</span>
      </div>
      {health.providers.length > 0 && (
        <div className="flex items-center gap-1.5">
          <StatusDot ok />
          <span>{health.providers.length} provider{health.providers.length !== 1 ? 's' : ''}</span>
        </div>
      )}
      <span className={`ml-auto text-[10px] font-medium uppercase tracking-wider ${health.status === 'healthy' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
        {health.status}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row state hook
// ---------------------------------------------------------------------------

interface RowConfig<S> {
  statsEndpoint: string;
  actionEndpoint: string;
  extract: (s: S) => {
    done: number;
    total: number;
    pct: number;
    complete: boolean;
    actionable: number;
    label: string;
    statsText: string;
    actionLabel: string;
  };
  detailLines?: (s: S) => string[];
  resultMessage: (data: any) => string | null;
}

function useMaintenanceRow<S>(config: RowConfig<S>) {
  const [stats, setStats] = useState<S | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<S>(config.statsEndpoint);
      setStats(data);
      setResult(null);
    } catch (err: any) {
      setResult({ message: err.message || 'Failed to load stats', isError: true });
    } finally {
      setLoading(false);
    }
  }, [config.statsEndpoint]);

  const runAction = useCallback(async () => {
    setActing(true);
    setResult(null);
    try {
      const data = await apiFetch<any>(config.actionEndpoint, 'POST');
      const msg = config.resultMessage(data);
      if (msg) setResult({ message: msg });
      const refreshed = await apiFetch<S>(config.statsEndpoint);
      setStats(refreshed);
    } catch (err: any) {
      setResult({ message: err.message || 'Action failed', isError: true });
    } finally {
      setActing(false);
    }
  }, [config.statsEndpoint, config.actionEndpoint, config.resultMessage]);

  return { stats, loading, acting, result, fetchStats, runAction };
}

// ---------------------------------------------------------------------------
// Row configs
// ---------------------------------------------------------------------------

const shaConfig: RowConfig<SHAStats> = {
  statsEndpoint: '/api/v1/assets/sha-stats',
  actionEndpoint: '/api/v1/assets/backfill-sha?limit=100',
  extract: (s) => ({
    done: s.with_sha,
    total: s.total_assets,
    pct: s.percentage,
    complete: s.without_sha === 0,
    actionable: s.without_sha_with_local,
    label: 'SHA256 Hashes',
    statsText: `${fmt(s.with_sha)} / ${fmt(s.total_assets)} hashed`,
    actionLabel: `Hash ${Math.min(100, s.without_sha_with_local)}`,
  }),
  detailLines: (s) => {
    const lines: string[] = [];
    if (s.without_sha_with_local > 0)
      lines.push(`${fmt(s.without_sha_with_local)} can be hashed (have local file)`);
    if (s.without_sha_no_local > 0)
      lines.push(`${fmt(s.without_sha_no_local)} remote-only (no local file)`);
    if (s.without_sha === 0)
      lines.push('All assets have SHA256 hashes');
    return lines;
  },
  resultMessage: (d) =>
    d.updated > 0
      ? `${d.updated} hashes computed${d.duplicates > 0 ? `, ${d.duplicates} duplicates` : ''}${d.skipped > 0 ? `, ${d.skipped} skipped` : ''}`
      : null,
};

const storageConfig: RowConfig<StorageSyncStats> = {
  statsEndpoint: '/api/v1/assets/storage-sync-stats',
  actionEndpoint: '/api/v1/assets/bulk-sync-storage?limit=50',
  extract: (s) => ({
    done: s.new_storage,
    total: s.total_assets,
    pct: s.percentage,
    complete: s.old_storage === 0 && s.total_assets > 0,
    actionable: s.old_storage,
    label: 'Content Storage',
    statsText: `${fmt(s.new_storage)} / ${fmt(s.total_assets)} synced`,
    actionLabel: `Sync ${Math.min(50, s.old_storage)}`,
  }),
  detailLines: (s) => {
    const lines: string[] = [];
    if (s.old_storage > 0)
      lines.push(`${fmt(s.old_storage)} on legacy storage`);
    if (s.no_local > 0)
      lines.push(`${fmt(s.no_local)} remote-only (no local file)`);
    if (s.old_storage === 0 && s.total_assets > 0)
      lines.push('All assets on content-addressed storage');
    return lines;
  },
  resultMessage: (d) =>
    d.synced > 0 ? `${d.synced} synced${d.errors > 0 ? `, ${d.errors} errors` : ''}` : null,
};

const contentConfig: RowConfig<ContentBlobStats> = {
  statsEndpoint: '/api/v1/assets/content-blob-stats',
  actionEndpoint: '/api/v1/assets/backfill-content-blobs?limit=100',
  extract: (s) => ({
    done: s.with_content_id,
    total: s.total_assets,
    pct: s.percentage,
    complete: s.missing_content_id === 0 && s.missing_logical_size === 0,
    actionable: s.missing_with_sha + s.missing_logical_size,
    label: 'Content Links',
    statsText: `${fmt(s.with_content_id)} / ${fmt(s.total_assets)} linked`,
    actionLabel: `Link ${Math.min(100, s.missing_with_sha + s.missing_logical_size)}`,
  }),
  detailLines: (s) => {
    const lines: string[] = [];
    if (s.missing_with_sha > 0)
      lines.push(`${fmt(s.missing_with_sha)} linkable (have SHA hash)`);
    if (s.missing_logical_size > 0)
      lines.push(`${fmt(s.missing_logical_size)} need size update`);
    const needSha = s.missing_content_id - s.missing_with_sha;
    if (needSha > 0)
      lines.push(`${fmt(needSha)} need SHA hash first`);
    if (s.missing_content_id === 0 && s.missing_logical_size === 0)
      lines.push('All assets linked to content blobs');
    return lines;
  },
  resultMessage: (d) => {
    const parts: string[] = [];
    if (d.linked > 0) parts.push(`${d.linked} linked`);
    if (d.updated_sizes > 0) parts.push(`${d.updated_sizes} sizes updated`);
    if (d.errors > 0) parts.push(`${d.errors} errors`);
    return parts.length > 0 ? parts.join(', ') : null;
  },
};

const uploadMethodConfig: RowConfig<UploadMethodStats> = {
  statsEndpoint: '/api/v1/assets/upload-method-stats',
  actionEndpoint: '/api/v1/assets/backfill-upload-method?limit=500',
  extract: (s) => ({
    done: s.with_upload_method,
    total: s.total_assets,
    pct: s.percentage,
    complete: s.without_upload_method === 0,
    actionable: s.without_upload_method,
    label: 'Upload Method',
    statsText: `${fmt(s.with_upload_method)} / ${fmt(s.total_assets)} tagged`,
    actionLabel: `Infer ${Math.min(500, s.without_upload_method)}`,
  }),
  detailLines: (s) => {
    const lines: string[] = [];
    const methods = Object.entries(s.by_method).sort(([, a], [, b]) => b - a);
    if (methods.length > 0) {
      lines.push(methods.map(([m, c]) => `${m}: ${fmt(c)}`).join(', '));
    }
    if (s.without_upload_method > 0)
      lines.push(`${fmt(s.without_upload_method)} not yet classified`);
    if (s.without_upload_method === 0)
      lines.push('All assets have upload method');
    return lines;
  },
  resultMessage: (d) => {
    if (d.updated > 0) {
      const methods = Object.entries(d.by_method || {})
        .sort(([, a]: any, [, b]: any) => b - a)
        .map(([m, c]) => `${m}: ${c}`)
        .join(', ');
      return `${d.updated} classified${methods ? ` (${methods})` : ''}${d.errors > 0 ? `, ${d.errors} errors` : ''}`;
    }
    return null;
  },
};

const folderContextConfig: RowConfig<FolderContextStats> = {
  statsEndpoint: '/api/v1/assets/folder-context-stats',
  actionEndpoint: '/api/v1/assets/backfill-folder-context?limit=200',
  extract: (s) => ({
    done: s.with_folder_context,
    total: s.total_local,
    pct: s.percentage,
    complete: s.without_folder_context === 0 && s.total_local > 0,
    actionable: s.fixable_from_metadata + s.fixable_from_prefs,
    label: 'Folder Context',
    statsText: `${fmt(s.with_folder_context)} / ${fmt(s.total_local)} local tagged`,
    actionLabel: `Fix ${Math.min(200, s.fixable_from_metadata + s.fixable_from_prefs)}`,
  }),
  detailLines: (s) => {
    const lines: string[] = [];
    if (s.fixable_from_metadata > 0)
      lines.push(`${fmt(s.fixable_from_metadata)} recoverable from metadata`);
    if (s.fixable_from_prefs > 0)
      lines.push(`${fmt(s.fixable_from_prefs)} need folder name lookup`);
    if (s.unfixable > 0)
      lines.push(`${fmt(s.unfixable)} need client-side re-scan`);
    if (s.without_folder_context === 0 && s.total_local > 0)
      lines.push('All local assets have folder context');
    return lines;
  },
  resultMessage: (d) => {
    const parts: string[] = [];
    if (d.phase1_bootstrapped > 0) parts.push(`${d.phase1_bootstrapped} bootstrapped`);
    if (d.phase2_named > 0) parts.push(`${d.phase2_named} named`);
    if (d.phase3_subfolder > 0) parts.push(`${d.phase3_subfolder} subfolders`);
    if (d.errors > 0) parts.push(`${d.errors} errors`);
    return parts.length > 0 ? parts.join(', ') : null;
  },
};

// ---------------------------------------------------------------------------
// Chevron
// ---------------------------------------------------------------------------

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-3 h-3 text-muted-foreground/50 transition-transform ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// MaintenanceRow — stats-based row with expandable detail
// ---------------------------------------------------------------------------

function MaintenanceRow<S>({
  config,
  onRefresh,
}: {
  config: RowConfig<S>;
  onRefresh: React.MutableRefObject<(() => Promise<void>)[]>;
}) {
  const { stats, loading, acting, result, fetchStats, runAction } = useMaintenanceRow(config);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const cbs = onRefresh.current;
    cbs.push(fetchStats);
    return () => {
      const idx = cbs.indexOf(fetchStats);
      if (idx >= 0) cbs.splice(idx, 1);
    };
  }, [fetchStats, onRefresh]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (!stats) {
    return (
      <div className="flex items-center gap-3 py-2.5 px-3">
        <Spinner />
        <span className="text-xs text-muted-foreground">{loading ? 'Loading...' : 'No data'}</span>
      </div>
    );
  }

  const info = config.extract(stats);
  const busy = loading || acting;
  const details = config.detailLines?.(stats) ?? [];
  const hasDetails = details.length > 0;

  return (
    <div>
      {/* Main row */}
      <div
        className={`flex items-center gap-3 py-2 px-3 ${hasDetails ? 'cursor-pointer hover:bg-muted/30 transition-colors' : ''}`}
        onClick={hasDetails ? () => setExpanded((e) => !e) : undefined}
      >
        {/* Expand chevron */}
        <div className="w-3 shrink-0">
          {hasDetails && <Chevron expanded={expanded} />}
        </div>

        {/* Label */}
        <span className="text-xs font-medium w-[110px] shrink-0 truncate">{info.label}</span>

        {/* Stats text */}
        <span className="text-xs text-muted-foreground w-[160px] shrink-0 tabular-nums">{info.statsText}</span>

        {/* Progress bar */}
        <div className="flex-1 min-w-[80px]">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${info.complete ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${info.pct}%` }}
            />
          </div>
        </div>

        {/* Percentage */}
        <span
          className={`text-xs font-medium w-[36px] text-right tabular-nums ${
            info.complete ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
          }`}
        >
          {info.pct.toFixed(0)}%
        </span>

        {/* Action */}
        <div className="w-[90px] shrink-0 flex justify-end" onClick={(e) => e.stopPropagation()}>
          {info.complete ? (
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : info.actionable > 0 ? (
            <Button onClick={runAction} disabled={busy} variant="outline" size="sm">
              {acting ? <Spinner className="w-3 h-3" /> : info.actionLabel}
            </Button>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </div>
      </div>

      {/* Expanded detail lines */}
      {expanded && details.length > 0 && (
        <div className="px-3 pb-2 pl-[30px] space-y-0.5">
          {details.map((line, i) => (
            <div key={i} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-muted-foreground/30 shrink-0" />
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Inline result / error */}
      {result && (
        <div
          className={`flex items-center gap-1.5 text-[11px] px-3 pl-[30px] pb-1.5 ${
            result.isError ? 'text-red-500' : 'text-green-600 dark:text-green-400'
          }`}
        >
          {result.isError ? (
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {result.message}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ThumbnailRow — action-only (no stats endpoint)
// ---------------------------------------------------------------------------

function ThumbnailRow({
  onRefresh,
}: {
  onRefresh: React.MutableRefObject<(() => Promise<void>)[]>;
}) {
  const [acting, setActing] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  const regenerate = useCallback(async () => {
    setActing(true);
    setResult(null);
    try {
      const data = await apiFetch<any>('/api/v1/assets/backfill-thumbnails?limit=50&missing_only=true', 'POST');
      if (data.generated > 0 || data.errors > 0) {
        const parts: string[] = [];
        parts.push(`${data.generated} regenerated`);
        if (data.skipped > 0) parts.push(`${data.skipped} skipped`);
        if (data.errors > 0) parts.push(`${data.errors} errors`);
        setResult({ message: parts.join(', ') });
      } else {
        setResult({ message: 'No missing thumbnails found' });
      }
    } catch (err: any) {
      setResult({ message: err.message || 'Failed to regenerate', isError: true });
    } finally {
      setActing(false);
    }
  }, []);

  // Register a no-op refresh (nothing to fetch)
  useEffect(() => {
    const noop = async () => {};
    const cbs = onRefresh.current;
    cbs.push(noop);
    return () => {
      const idx = cbs.indexOf(noop);
      if (idx >= 0) cbs.splice(idx, 1);
    };
  }, [onRefresh]);

  return (
    <div>
      <div className="flex items-center gap-3 py-2 px-3">
        {/* No chevron */}
        <div className="w-3 shrink-0" />

        {/* Label */}
        <span className="text-xs font-medium w-[110px] shrink-0 truncate">Thumbnails</span>

        {/* Description instead of stats */}
        <span className="text-xs text-muted-foreground flex-1">
          Regenerate missing thumbnail files
        </span>

        {/* Action */}
        <div className="w-[90px] shrink-0 flex justify-end">
          <Button onClick={regenerate} disabled={acting} variant="outline" size="sm">
            {acting ? <Spinner className="w-3 h-3" /> : 'Regen 50'}
          </Button>
        </div>
      </div>

      {result && (
        <div
          className={`flex items-center gap-1.5 text-[11px] px-3 pl-[30px] pb-1.5 ${
            result.isError ? 'text-red-500' : 'text-green-600 dark:text-green-400'
          }`}
        >
          {result.isError ? (
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {result.message}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function MaintenanceDashboard() {
  const refreshCallbacks = useRef<(() => Promise<void>)[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.allSettled(refreshCallbacks.current.map((cb) => cb()));
    setRefreshing(false);
  };

  return (
    <div className="space-y-0">
      {/* System health */}
      <HealthHeader />
      <div className="h-px bg-border mx-3" />

      {/* Column headers */}
      <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 select-none">
        <span className="w-3 shrink-0" />
        <span className="w-[110px] shrink-0">Task</span>
        <span className="w-[160px] shrink-0">Status</span>
        <span className="flex-1 min-w-[80px]">Progress</span>
        <span className="w-[36px] text-right">%</span>
        <span className="w-[90px] shrink-0 text-right">Action</span>
      </div>
      <div className="h-px bg-border mx-3" />

      {/* Stats-based rows */}
      <MaintenanceRow config={shaConfig} onRefresh={refreshCallbacks} />
      <div className="h-px bg-border/50 mx-3" />
      <MaintenanceRow config={storageConfig} onRefresh={refreshCallbacks} />
      <div className="h-px bg-border/50 mx-3" />
      <MaintenanceRow config={contentConfig} onRefresh={refreshCallbacks} />
      <div className="h-px bg-border/50 mx-3" />
      <MaintenanceRow config={uploadMethodConfig} onRefresh={refreshCallbacks} />
      <div className="h-px bg-border/50 mx-3" />
      <MaintenanceRow config={folderContextConfig} onRefresh={refreshCallbacks} />

      {/* Separator before action-only rows */}
      <div className="h-px bg-border mx-3" />
      <ThumbnailRow onRefresh={refreshCallbacks} />

      {/* Footer */}
      <div className="h-px bg-border mx-3" />
      <div className="flex justify-end px-3 pt-2 pb-1">
        <Button onClick={refreshAll} disabled={refreshing} variant="outline" size="sm">
          {refreshing ? (
            <>
              <Spinner className="w-3 h-3" />
              <span className="ml-1.5">Refreshing…</span>
            </>
          ) : (
            'Refresh All'
          )}
        </Button>
      </div>
    </div>
  );
}

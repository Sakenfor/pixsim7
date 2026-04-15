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
import { withCorrelationHeaders } from '@lib/api/correlationHeaders';

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
    headers: withCorrelationHeaders(authHeaders(), 'settings:maintenance-dashboard'),
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
  /** Endpoint with `{limit}` placeholder for batch size, e.g. `/api/v1/assets/backfill-sha?limit={limit}` */
  actionEndpoint: string;
  /** Available batch sizes for the dropdown. Default: [50, 100, 200] */
  batchSizes?: number[];
  /** Initial batch size. Default: first item in batchSizes */
  defaultBatchSize?: number;
  extract: (s: S) => {
    done: number;
    total: number;
    pct: number;
    complete: boolean;
    actionable: number;
    label: string;
    statsText: string;
    /** Short verb for button, e.g. "Hash", "Convert", "Sync" */
    actionVerb: string;
  };
  detailLines?: (s: S) => string[];
  resultMessage: (data: any) => string | null;
}

const DEFAULT_BATCH_SIZES = [50, 100, 200, 500];

function resolveEndpoint(template: string, batchSize: number): string {
  if (template.includes('{limit}')) {
    return template.replace('{limit}', String(batchSize));
  }
  // Legacy: endpoint already has hardcoded limit — append/replace
  const url = new URL(template, 'http://x');
  url.searchParams.set('limit', String(batchSize));
  return url.pathname + url.search;
}

function useMaintenanceRow<S>(config: RowConfig<S>, batchSize: number) {
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
      const endpoint = resolveEndpoint(config.actionEndpoint, batchSize);
      const data = await apiFetch<any>(endpoint, 'POST');
      const msg = config.resultMessage(data);
      if (msg) setResult({ message: msg });
      const refreshed = await apiFetch<S>(config.statsEndpoint);
      setStats(refreshed);
    } catch (err: any) {
      setResult({ message: err.message || 'Action failed', isError: true });
    } finally {
      setActing(false);
    }
  }, [config.statsEndpoint, config.actionEndpoint, config.resultMessage, batchSize]);

  return { stats, loading, acting, result, fetchStats, runAction };
}

// ---------------------------------------------------------------------------
// Row configs
// ---------------------------------------------------------------------------

const shaConfig: RowConfig<SHAStats> = {
  statsEndpoint: '/api/v1/assets/sha-stats',
  actionEndpoint: '/api/v1/assets/backfill-sha?limit={limit}',
  extract: (s) => ({
    done: s.with_sha,
    total: s.total_assets,
    pct: s.percentage,
    complete: s.without_sha === 0,
    actionable: s.without_sha_with_local,
    label: 'SHA256 Hashes',
    statsText: `${fmt(s.with_sha)} / ${fmt(s.total_assets)} hashed`,
    actionVerb: 'Hash',
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
  actionEndpoint: '/api/v1/assets/bulk-sync-storage?limit={limit}',
  extract: (s) => ({
    done: s.new_storage,
    total: s.total_assets,
    pct: s.percentage,
    complete: s.old_storage === 0 && s.total_assets > 0,
    actionable: s.old_storage,
    label: 'Content Storage',
    statsText: `${fmt(s.new_storage)} / ${fmt(s.total_assets)} synced`,
    actionVerb: 'Sync',
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
  actionEndpoint: '/api/v1/assets/backfill-content-blobs?limit={limit}',
  extract: (s) => ({
    done: s.with_content_id,
    total: s.total_assets,
    pct: s.percentage,
    complete: s.missing_content_id === 0 && s.missing_logical_size === 0,
    actionable: s.missing_with_sha + s.missing_logical_size,
    label: 'Content Links',
    statsText: `${fmt(s.with_content_id)} / ${fmt(s.total_assets)} linked`,
    actionVerb: 'Link',
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
  actionEndpoint: '/api/v1/assets/backfill-upload-method?limit={limit}',
  defaultBatchSize: 500,
  extract: (s) => ({
    done: s.with_upload_method,
    total: s.total_assets,
    pct: s.percentage,
    complete: s.without_upload_method === 0,
    actionable: s.without_upload_method,
    label: 'Upload Method',
    statsText: `${fmt(s.with_upload_method)} / ${fmt(s.total_assets)} tagged`,
    actionVerb: 'Infer',
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
  actionEndpoint: '/api/v1/assets/backfill-folder-context?limit={limit}',
  defaultBatchSize: 200,
  extract: (s) => ({
    done: s.with_folder_context,
    total: s.total_local,
    pct: s.percentage,
    complete: s.without_folder_context === 0 && s.total_local > 0,
    actionable: s.fixable_from_metadata + s.fixable_from_prefs,
    label: 'Folder Context',
    statsText: `${fmt(s.with_folder_context)} / ${fmt(s.total_local)} local tagged`,
    actionVerb: 'Fix',
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

interface FormatBreakdown {
  mime_type: string;
  count: number;
  size_bytes: number;
  size_human: string;
}

interface FormatConversionStats {
  total_images: number;
  formats: FormatBreakdown[];
  convertible_count: number;
  convertible_size_bytes: number;
  convertible_size_human: string;
  target_format: string;
  estimated_savings_pct: number;
}

const formatConversionConfig: RowConfig<FormatConversionStats> = {
  statsEndpoint: '/api/v1/assets/format-conversion-stats?target_format=webp',
  actionEndpoint: '/api/v1/assets/convert-format?target_format=webp&quality=90&limit={limit}',
  defaultBatchSize: 100,
  extract: (s) => {
    const done = s.total_images - s.convertible_count;
    const pct = s.total_images > 0 ? (done / s.total_images) * 100 : 100;
    return {
      done,
      total: s.total_images,
      pct,
      complete: s.convertible_count === 0,
      actionable: s.convertible_count,
      label: 'Format Conversion',
      statsText: `${fmt(s.convertible_count)} convertible (${s.convertible_size_human})`,
      actionVerb: 'Convert',
    };
  },
  detailLines: (s) => {
    const lines: string[] = [];
    for (const f of s.formats) {
      lines.push(`${f.mime_type.replace('image/', '')}: ${fmt(f.count)} (${f.size_human})`);
    }
    if (s.convertible_count > 0 && s.estimated_savings_pct > 0)
      lines.push(`Estimated savings: ~${s.estimated_savings_pct.toFixed(0)}% → ${s.target_format}`);
    if (s.convertible_count === 0)
      lines.push(`All images already ${s.target_format}`);
    return lines;
  },
  resultMessage: (d) =>
    d.converted > 0
      ? `${d.converted} converted, saved ${d.savings_human}${d.errors > 0 ? `, ${d.errors} errors` : ''}`
      : d.skipped > 0
      ? `${d.skipped} skipped (files not found on disk)`
      : null,
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
  const sizes = config.batchSizes ?? DEFAULT_BATCH_SIZES;
  const [batchSize, setBatchSize] = useState(config.defaultBatchSize ?? sizes[0]);
  const { stats, loading, acting, result, fetchStats, runAction } = useMaintenanceRow(config, batchSize);
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
  const effectiveBatch = Math.min(batchSize, info.actionable);

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

        {/* Action: verb button + batch size selector */}
        <div className="w-[130px] shrink-0 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {info.complete ? (
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : info.actionable > 0 ? (
            <>
              <select
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                disabled={busy}
                className="h-7 text-[11px] bg-transparent border border-border rounded px-1 text-muted-foreground disabled:opacity-50 cursor-pointer tabular-nums"
              >
                {sizes.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <Button onClick={runAction} disabled={busy} variant="outline" size="sm">
                {acting ? <Spinner className="w-3 h-3" /> : `${info.actionVerb} ${effectiveBatch}`}
              </Button>
            </>
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
        <div className="w-[130px] shrink-0 flex justify-end">
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
// Storage Overview types
// ---------------------------------------------------------------------------

interface DirectorySize {
  path: string;
  label: string;
  size_bytes: number;
  size_human: string;
  file_count: number | null;
  note: string | null;
}

interface SubdirectorySize {
  name: string;
  size_bytes: number;
  size_human: string;
  file_count: number;
}

interface MediaTypeBreakdown {
  mime_type: string;
  media_type: string;
  count: number;
  size_bytes: number;
  size_human: string;
  pct_of_total: number;
}

interface TableSizeInfo {
  table_name: string;
  row_count: number;
  total_bytes: number;
  total_human: string;
  data_bytes: number;
  toast_bytes: number;
  index_bytes: number;
}

interface UnusedIndexInfo {
  index_name: string;
  table_name: string;
  size_bytes: number;
  size_human: string;
  index_scans: number;
}

interface CleanupOpportunityInfo {
  id: string;
  label: string;
  description: string;
  estimated_savings_bytes: number;
  estimated_savings_human: string;
  severity: string;
  action_endpoint: string | null;
}

interface StorageOverviewData {
  total_size_bytes: number;
  total_size_human: string;
  scan_duration_ms: number;
  directories: DirectorySize[];
  media_subdirectories: SubdirectorySize[];
  media_types: MediaTypeBreakdown[];
  db_tables: TableSizeInfo[];
  unused_indexes: UnusedIndexInfo[];
  cleanup_opportunities: CleanupOpportunityInfo[];
  db_total_bytes: number;
  db_total_human: string;
}

// ---------------------------------------------------------------------------
// Storage Overview colors
// ---------------------------------------------------------------------------

const DIR_COLORS: Record<string, string> = {
  media: 'bg-blue-500',
  postgres: 'bg-amber-500',
  timescaledb: 'bg-purple-500',
  logs: 'bg-violet-500',
  orphaned: 'bg-red-400',
  redis: 'bg-emerald-500',
  storage: 'bg-cyan-500',
};

const DIR_DOT_COLORS: Record<string, string> = {
  media: 'bg-blue-500',
  postgres: 'bg-amber-500',
  timescaledb: 'bg-purple-500',
  logs: 'bg-violet-500',
  orphaned: 'bg-red-400',
  redis: 'bg-emerald-500',
  storage: 'bg-cyan-500',
};

function dirColor(path: string, type: 'bar' | 'dot' = 'bar'): string {
  const map = type === 'dot' ? DIR_DOT_COLORS : DIR_COLORS;
  return map[path] || 'bg-gray-400';
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function Section({
  title,
  defaultOpen = false,
  count,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-muted/30 transition-colors select-none"
        onClick={() => setOpen((o) => !o)}
      >
        <Chevron expanded={open} />
        <span className="text-[11px] font-medium text-muted-foreground">{title}</span>
        {count != null && (
          <span className="text-[10px] text-muted-foreground/50">({count})</span>
        )}
      </div>
      {open && children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stacked bar
// ---------------------------------------------------------------------------

function StackedBar({ segments }: { segments: { key: string; bytes: number; color: string; label: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.bytes, 0) || 1;
  return (
    <div className="flex h-3 rounded-full overflow-hidden bg-muted">
      {segments.map((seg) => {
        const pct = (seg.bytes / total) * 100;
        if (pct < 0.5) return null;
        return (
          <div
            key={seg.key}
            className={`${seg.color} transition-all`}
            style={{ width: `${pct}%` }}
            title={`${seg.label}: ${fmt(seg.bytes)} bytes`}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini bar (single value out of total)
// ---------------------------------------------------------------------------

function MiniBar({ value, total, color = 'bg-blue-500' }: { value: number; total: number; color?: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex-1 min-w-[60px] h-1.5 bg-muted rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, 0.5)}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table size stacked bar (data / toast / index)
// ---------------------------------------------------------------------------

function TableSizeBar({ data, toast, index }: { data: number; toast: number; index: number }) {
  const total = data + toast + index || 1;
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-muted min-w-[60px]">
      <div className="bg-blue-500 h-full" style={{ width: `${(data / total) * 100}%` }} title={`Data: ${fmtSize(data)}`} />
      <div className="bg-amber-400 h-full" style={{ width: `${(toast / total) * 100}%` }} title={`TOAST: ${fmtSize(toast)}`} />
      <div className="bg-gray-400 h-full" style={{ width: `${(index / total) * 100}%` }} title={`Indexes: ${fmtSize(index)}`} />
    </div>
  );
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Severity badge
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    severity === 'critical'
      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      : severity === 'warning'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider ${cls}`}>
      {severity}
    </span>
  );
}

// ---------------------------------------------------------------------------
// StorageOverview
// ---------------------------------------------------------------------------

function StorageOverview({
  onRefresh,
}: {
  onRefresh: React.MutableRefObject<(() => Promise<void>)[]>;
}) {
  const [data, setData] = useState<StorageOverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiFetch<StorageOverviewData>('/api/v1/assets/storage-overview');
      setData(resp);
    } catch (err: any) {
      setError(err.message || 'Failed to load storage overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cbs = onRefresh.current;
    cbs.push(fetchData);
    return () => {
      const idx = cbs.indexOf(fetchData);
      if (idx >= 0) cbs.splice(idx, 1);
    };
  }, [fetchData, onRefresh]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const runCleanupAction = useCallback(async (endpoint: string, id: string) => {
    setRunningAction(id);
    setActionResult(null);
    try {
      const result = await apiFetch<any>(endpoint, 'POST');
      const msg = result.dry_run
        ? `Dry run: ${result.freed_human || result.deleted_count + ' items'} would be freed`
        : `Done: ${result.freed_human || ''} freed`;
      setActionResult({ message: msg });
      // Refresh after non-dry-run
      if (!result.dry_run) fetchData();
    } catch (err: any) {
      setActionResult({ message: err.message || 'Action failed', isError: true });
    } finally {
      setRunningAction(null);
    }
  }, [fetchData]);

  if (!data && loading) {
    return (
      <div className="flex items-center gap-3 py-4 px-3">
        <Spinner />
        <span className="text-xs text-muted-foreground">Scanning storage…</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center gap-2 py-3 px-3 text-[11px] text-red-500">
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {error}
      </div>
    );
  }

  if (!data) return null;

  const barSegments = data.directories.map((d) => ({
    key: d.path,
    bytes: d.size_bytes,
    color: dirColor(d.path),
    label: d.label,
  }));

  return (
    <div className="space-y-0">
      {/* Summary header */}
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-xs font-medium">Storage Overview</span>
          <div className="flex items-center gap-2">
            {loading && <Spinner className="w-3 h-3" />}
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {data.total_size_human} total
            </span>
            <span className="text-[10px] text-muted-foreground/40 tabular-nums">
              {data.scan_duration_ms}ms
            </span>
          </div>
        </div>
        <StackedBar segments={barSegments} />
        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
          {data.directories.slice(0, 6).map((d) => (
            <div key={d.path} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-sm ${dirColor(d.path, 'dot')}`} />
              <span className="text-[10px] text-muted-foreground">{d.label}</span>
              <span className="text-[10px] text-muted-foreground/60 tabular-nums">{d.size_human}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="h-px bg-border/50 mx-3" />

      {/* Directories */}
      <Section title="Directories" defaultOpen count={data.directories.length}>
        <div className="px-3 pb-2 space-y-1">
          {data.directories.map((d) => (
            <div key={d.path} className="flex items-center gap-2 text-[11px]">
              <span className={`w-2 h-2 rounded-sm shrink-0 ${dirColor(d.path, 'dot')}`} />
              <span className="w-[120px] shrink-0 truncate text-muted-foreground">{d.label}</span>
              <span className="w-[70px] shrink-0 text-right tabular-nums">{d.size_human}</span>
              <MiniBar value={d.size_bytes} total={data.total_size_bytes} color={dirColor(d.path)} />
              <span className="w-[55px] shrink-0 text-right text-muted-foreground/60 tabular-nums text-[10px]">
                {d.file_count != null ? `${fmtCount(d.file_count)} files` : d.note || ''}
              </span>
            </div>
          ))}
          {/* Media subdirectory detail */}
          {data.media_subdirectories.length > 0 && (
            <div className="pt-1 pl-4 space-y-0.5">
              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Media breakdown</span>
              {data.media_subdirectories.map((sd) => {
                const mediaDirBytes = data.directories.find((d) => d.path === 'media')?.size_bytes || 1;
                return (
                  <div key={sd.name} className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30 shrink-0" />
                    <span className="w-[100px] shrink-0 truncate">{sd.name}/</span>
                    <span className="w-[60px] shrink-0 text-right tabular-nums">{sd.size_human}</span>
                    <MiniBar value={sd.size_bytes} total={mediaDirBytes} color="bg-blue-400" />
                    <span className="w-[55px] shrink-0 text-right tabular-nums text-[10px]">{fmtCount(sd.file_count)} files</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Section>

      <div className="h-px bg-border/50 mx-3" />

      {/* Media by format */}
      <Section title="Media by Format" count={data.media_types.length}>
        <div className="px-3 pb-2 space-y-1">
          {data.media_types.map((mt) => {
            const isConvertible = mt.mime_type === 'image/png' || mt.mime_type === 'image/bmp';
            return (
              <div key={mt.mime_type} className="flex items-center gap-2 text-[11px]">
                <span className={`w-2 h-2 rounded-sm shrink-0 ${mt.media_type === 'video' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                <span className="w-[100px] shrink-0 truncate text-muted-foreground">
                  {mt.mime_type.replace('image/', '').replace('video/', '')}
                </span>
                <span className="w-[50px] shrink-0 text-right tabular-nums text-muted-foreground/60">
                  {fmtCount(mt.count)}
                </span>
                <span className="w-[60px] shrink-0 text-right tabular-nums">{mt.size_human}</span>
                <MiniBar
                  value={mt.size_bytes}
                  total={data.media_types[0]?.size_bytes || 1}
                  color={mt.media_type === 'video' ? 'bg-emerald-500' : 'bg-blue-500'}
                />
                <span className="w-[36px] shrink-0 text-right tabular-nums text-muted-foreground/60 text-[10px]">
                  {mt.pct_of_total.toFixed(0)}%
                </span>
                {isConvertible && (
                  <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium">convertible</span>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <div className="h-px bg-border/50 mx-3" />

      {/* Database tables */}
      <Section title="Database Tables" count={data.db_tables.length}>
        <div className="px-3 pb-2 space-y-1">
          {/* Legend for table bar colors */}
          <div className="flex items-center gap-3 mb-1 text-[9px] text-muted-foreground/50">
            <div className="flex items-center gap-1"><span className="w-2 h-1 bg-blue-500 rounded-sm" />Data</div>
            <div className="flex items-center gap-1"><span className="w-2 h-1 bg-amber-400 rounded-sm" />TOAST</div>
            <div className="flex items-center gap-1"><span className="w-2 h-1 bg-gray-400 rounded-sm" />Indexes</div>
            <span className="ml-auto">DB total: {data.db_total_human}</span>
          </div>
          {data.db_tables.map((t) => (
            <div key={t.table_name} className="flex items-center gap-2 text-[11px]">
              <span className="w-[160px] shrink-0 truncate text-muted-foreground font-mono text-[10px]">{t.table_name}</span>
              <span className="w-[45px] shrink-0 text-right tabular-nums text-muted-foreground/60 text-[10px]">
                {fmtCount(t.row_count)}
              </span>
              <span className="w-[55px] shrink-0 text-right tabular-nums">{t.total_human}</span>
              <div className="flex-1 min-w-[60px]">
                <TableSizeBar data={t.data_bytes} toast={t.toast_bytes} index={t.index_bytes} />
              </div>
            </div>
          ))}
          {/* Unused indexes */}
          {data.unused_indexes.length > 0 && (
            <div className="pt-1.5 space-y-0.5">
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                {data.unused_indexes.length} unused indexes ({fmtSize(data.unused_indexes.reduce((s, i) => s + i.size_bytes, 0))})
              </span>
              <div className="pl-2 space-y-0.5 max-h-[100px] overflow-y-auto">
                {data.unused_indexes.slice(0, 10).map((idx) => (
                  <div key={idx.index_name} className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                    <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                    <span className="truncate font-mono">{idx.index_name}</span>
                    <span className="shrink-0 tabular-nums">{idx.size_human}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Cleanup opportunities */}
      {data.cleanup_opportunities.length > 0 && (
        <>
          <div className="h-px bg-border/50 mx-3" />
          <div className="px-3 py-2 space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">Cleanup opportunities</span>
            {data.cleanup_opportunities.map((opp) => (
              <div key={opp.id} className="flex items-center gap-2 text-[11px]">
                <SeverityBadge severity={opp.severity} />
                <div className="flex-1 min-w-0">
                  <span className="text-muted-foreground">{opp.description}</span>
                </div>
                <span className="shrink-0 tabular-nums font-medium text-[10px]">
                  ~{opp.estimated_savings_human}
                </span>
                {opp.action_endpoint && (
                  <Button
                    onClick={() => runCleanupAction(opp.action_endpoint!, opp.id)}
                    disabled={runningAction != null}
                    variant="outline"
                    size="sm"
                  >
                    {runningAction === opp.id ? <Spinner className="w-3 h-3" /> : 'Run'}
                  </Button>
                )}
              </div>
            ))}
            {actionResult && (
              <div
                className={`flex items-center gap-1.5 text-[11px] ${
                  actionResult.isError ? 'text-red-500' : 'text-green-600 dark:text-green-400'
                }`}
              >
                {actionResult.isError ? (
                  <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {actionResult.message}
              </div>
            )}
          </div>
        </>
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

      {/* Storage overview */}
      <StorageOverview onRefresh={refreshCallbacks} />
      <div className="h-px bg-border mx-3" />

      {/* Column headers */}
      <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 select-none">
        <span className="w-3 shrink-0" />
        <span className="w-[110px] shrink-0">Task</span>
        <span className="w-[160px] shrink-0">Status</span>
        <span className="flex-1 min-w-[80px]">Progress</span>
        <span className="w-[36px] text-right">%</span>
        <span className="w-[130px] shrink-0 text-right">Action</span>
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

      <div className="h-px bg-border/50 mx-3" />
      <MaintenanceRow config={formatConversionConfig} onRefresh={refreshCallbacks} />

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

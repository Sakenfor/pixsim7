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
 *  6. Preview Derivatives — preview regen at current preview_size cap
 *  7. Format Conversion   — image format conversion (webp/jpeg)
 *  8. Signal Scan         — broken-video heuristic scan
 *  9. Thumbnails          — action-only (regenerate missing)
 */

import {
  Badge,
  Button,
  DisclosureSection,
  LoadingSpinner,
  SidebarContentLayout,
  type SidebarContentLayoutSection,
  StatusPill,
  type StatusTone,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAsyncTask, useAsyncTaskStore } from '@lib/asyncTask';
import { Icon, type IconName } from '@lib/icons';

import { useAssetSets } from '@features/assets';

import { DuplicatesRow } from './DuplicatesRow';
import { DurationCohortTable } from './DurationCohortTable';
import { ErrorCatalogRow } from './ErrorCatalogRow';
import {
  bustStatsCache,
  extractErrorMessage,
  fmt,
  humanBytes,
  maintDelete,
  maintGet,
  maintGetRoot,
  maintPost,
  maintPut,
  readStatsCache,
  writeStatsCache,
} from './maintenanceShared';
import { Spinner } from './MaintenanceSpinner';
import { ProviderConcurrencyRow } from './ProviderConcurrencyRow';

const SURFACE = 'settings:maintenance-dashboard';

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

interface PreviewBackfillStats {
  total_assets: number;
  with_preview: number;
  eligible_no_preview: number;
  upgradeable: number;
  not_eligible: number;
  percentage: number;
  target_size: number;
  prev_cap: number;
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
// System health header
// ---------------------------------------------------------------------------

function HealthHeader() {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    // `/health` lives at the API root, NOT under /api/v1 — use the root helper.
    maintGetRoot<HealthStatus>('/health', SURFACE).then(setHealth).catch(() => {});
  }, []);

  if (!health) return null;

  const tone = (ok: boolean): StatusTone => (ok ? 'success' : 'danger');
  const dbOk = health.database === 'connected';
  const redisOk = health.redis === 'connected';
  const overallTone: StatusTone = health.status === 'healthy' ? 'success' : 'warning';

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <StatusPill tone={tone(dbOk)} dot>Database</StatusPill>
      <StatusPill tone={tone(redisOk)} dot>Redis</StatusPill>
      {health.providers.length > 0 && (
        <StatusPill tone="success" dot>
          {health.providers.length} provider{health.providers.length !== 1 ? 's' : ''}
        </StatusPill>
      )}
      <StatusPill tone={overallTone} className="ml-auto uppercase tracking-wider">
        {health.status}
      </StatusPill>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row state hook
// ---------------------------------------------------------------------------

interface RowConfig<S> {
  statsEndpoint: string;
  /** Endpoint with `{limit}` placeholder for batch size, e.g. `/assets/backfill-sha?limit={limit}` */
  actionEndpoint: string;
  /** Suggested quick-pick batch sizes (rendered as chips). Default: [50, 100, 200, 500] */
  batchSizes?: number[];
  /** Initial batch size. Default: first item in batchSizes */
  defaultBatchSize?: number;
  /** Hard upper bound on the user-typed batch size. Default: 500 (matches most backend Query limits). */
  maxBatchSize?: number;
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
  /**
   * Optional custom node that fully replaces the default bulleted breakdown.
   * When provided, `detailLines` is ignored. Use for tasks whose state is
   * better visualised (e.g. a stacked health bar) than narrated as bullets.
   */
  renderBreakdown?: (s: S) => ReactNode;
  /** Optional custom node rendered after the breakdown section. Receives loaded stats. */
  renderExtra?: (s: S) => ReactNode;
}

const DEFAULT_BATCH_SIZES = [50, 100, 200, 500];
const DEFAULT_MAX_BATCH_SIZE = 500;
const BATCH_SIZE_STORAGE_PREFIX = 'maintenance:batchSize:';

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
  const taskId = `maintenance:${config.statsEndpoint}`;
  const [stats, setStats] = useState<S | null>(() =>
    readStatsCache<S>(config.statsEndpoint),
  );
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    const cached = readStatsCache<S>(config.statsEndpoint);
    if (cached) {
      setStats(cached);
      setFetchError(null);
      return;
    }
    setLoading(true);
    try {
      const data = await maintGet<S>(config.statsEndpoint, SURFACE);
      writeStatsCache(config.statsEndpoint, data);
      setStats(data);
      setFetchError(null);
    } catch (err) {
      setFetchError(extractErrorMessage(err) || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, [config.statsEndpoint]);

  const { isRunning: acting, result: actionResult, run: runAction } = useAsyncTask(
    taskId,
    async () => {
      const endpoint = resolveEndpoint(config.actionEndpoint, batchSize);
      const data = await maintPost<any>(endpoint, SURFACE);
      const msg = config.resultMessage(data);
      bustStatsCache(config.statsEndpoint);
      const refreshed = await maintGet<S>(config.statsEndpoint, SURFACE);
      writeStatsCache(config.statsEndpoint, refreshed);
      setStats(refreshed);
      return msg;
    },
  );

  const result: ActionResult | null = useMemo(() => {
    if (fetchError) return { message: fetchError, isError: true };
    return actionResult;
  }, [fetchError, actionResult]);

  return { stats, loading, acting, result, fetchStats, runAction, taskId };
}

// ---------------------------------------------------------------------------
// Row configs
// ---------------------------------------------------------------------------

const shaConfig: RowConfig<SHAStats> = {
  statsEndpoint: '/assets/sha-stats',
  actionEndpoint: '/assets/backfill-sha?limit={limit}',
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
  statsEndpoint: '/assets/storage-sync-stats',
  actionEndpoint: '/assets/bulk-sync-storage?limit={limit}',
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
  statsEndpoint: '/assets/content-blob-stats',
  actionEndpoint: '/assets/backfill-content-blobs?limit={limit}',
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
  statsEndpoint: '/assets/upload-method-stats',
  actionEndpoint: '/assets/backfill-upload-method?limit={limit}',
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
  statsEndpoint: '/assets/folder-context-stats',
  actionEndpoint: '/assets/backfill-folder-context?limit={limit}',
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

interface SignalScanStats {
  total_videos: number;
  scanned: number;
  unscanned: number;
  broken: number;
  clean: number;
  borderline: number;
  overridden: number;
  scanner_version: string;
  percentage: number;
}

// ── Signal scan breakdown — stacked health bar + triage CTA ──
// Replaces the default bullet list with a single horizontal bar that shows
// broken/borderline/clean/unscanned proportions at a glance, plus a direct
// path into the triage UI when there's a flagged set worth validating.

const SIGNAL_SEGMENTS = [
  { key: 'broken',     label: 'Broken',     fill: 'bg-red-500',     text: 'text-red-700 dark:text-red-300',     dot: 'bg-red-500' },
  { key: 'borderline', label: 'Borderline', fill: 'bg-amber-500',   text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  { key: 'clean',      label: 'Clean',      fill: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  { key: 'unscanned',  label: 'Unscanned',  fill: 'bg-neutral-400 dark:bg-neutral-600', text: 'text-muted-foreground', dot: 'bg-neutral-400 dark:bg-neutral-600' },
] as const;

function SignalBreakdown({ stats }: { stats: SignalScanStats }) {
  const navigate = useNavigate();
  const counts: Record<typeof SIGNAL_SEGMENTS[number]['key'], number> = {
    broken: stats.broken,
    borderline: stats.borderline,
    clean: stats.clean,
    unscanned: stats.unscanned,
  };
  const total = useMemo(
    () => SIGNAL_SEGMENTS.reduce((acc, seg) => acc + (counts[seg.key] || 0), 0),
    [counts.broken, counts.borderline, counts.clean, counts.unscanned],
  );
  const totalDenominator = total > 0 ? total : 1;
  const visibleSegments = SIGNAL_SEGMENTS.filter((seg) => counts[seg.key] > 0);

  return (
    <section className="rounded-md border border-border/60 bg-muted/20 px-4 py-3 space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Breakdown
        </h3>
        {stats.overridden > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {fmt(stats.overridden)} manually overridden
          </span>
        )}
      </header>

      {/* Stacked bar — segments sized by share of total. Tooltip exposes counts
          for accessibility / quick inspection. */}
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={visibleSegments
          .map((seg) => `${counts[seg.key]} ${seg.label.toLowerCase()}`)
          .join(', ')}
      >
        {visibleSegments.map((seg) => {
          const count = counts[seg.key];
          const pct = (count / totalDenominator) * 100;
          return (
            <div
              key={seg.key}
              className={`${seg.fill} h-full first:rounded-l-full last:rounded-r-full transition-[width]`}
              style={{ width: `${pct}%` }}
              title={`${seg.label}: ${fmt(count)} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Legend — counts + share for each segment that has any items */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs tabular-nums">
        {visibleSegments.map((seg) => {
          const count = counts[seg.key];
          const pct = (count / totalDenominator) * 100;
          return (
            <div key={seg.key} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${seg.dot}`} />
              <span className={seg.text}>{seg.label}</span>
              <span className="text-muted-foreground">
                {fmt(count)}
                <span className="text-muted-foreground/60"> · {pct.toFixed(0)}%</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* CTA row — primary "Open triage" only when there's a flagged set;
          quiet "Open in diagnostic" cross-link is always shown for admins
          who want a parameterized scan with a live event stream + run
          history.  Both surfaces share the same scoring engine and write
          to the same media_metadata.signal_metrics field. */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        {stats.broken > 0 && (
          <Button
            onClick={() => navigate('/assets/signal-triage')}
            variant="outline"
            size="sm"
          >
            <span className="inline-flex items-center gap-1.5">
              Open triage
              <Icon name="arrowRight" size={12} />
            </span>
          </Button>
        )}
        <button
          type="button"
          onClick={() => navigate('/dev/testing/diagnostics?id=scan-suspicious-videos')}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
          title="Run scan-suspicious-videos as a parameterized diagnostic with a live event stream"
        >
          Open in diagnostic →
        </button>
      </div>
    </section>
  );
}

const signalScanConfig: RowConfig<SignalScanStats> = {
  statsEndpoint: '/assets/signal-scan-stats',
  actionEndpoint: '/assets/backfill-signal-scan?limit={limit}',
  defaultBatchSize: 200,
  extract: (s) => ({
    done: s.scanned,
    total: s.total_videos,
    pct: s.percentage,
    complete: s.unscanned === 0 && s.total_videos > 0,
    actionable: s.unscanned,
    label: 'Signal Scan',
    statsText: `${fmt(s.scanned)} / ${fmt(s.total_videos)} videos scanned`,
    actionVerb: 'Scan',
  }),
  renderBreakdown: (s) => <SignalBreakdown stats={s} />,
  resultMessage: (d) => {
    const parts: string[] = [];
    if (d.scanned > 0) parts.push(`${d.scanned} scanned`);
    if (d.broken > 0)  parts.push(`${d.broken} flagged broken`);
    if (d.skipped > 0) parts.push(`${d.skipped} skipped (no local file)`);
    if (d.errors > 0)  parts.push(`${d.errors} errors`);
    return parts.length > 0 ? parts.join(', ') : null;
  },
  renderExtra: () => <DurationCohortTable />,
};

const previewBackfillConfig: RowConfig<PreviewBackfillStats> = {
  statsEndpoint: '/assets/preview-backfill-stats',
  actionEndpoint: '/assets/backfill-previews?limit={limit}',
  defaultBatchSize: 100,
  extract: (s) => {
    const eligible = s.total_assets - s.not_eligible;
    return {
      done: s.with_preview,
      total: eligible,
      pct: s.percentage,
      complete: s.eligible_no_preview === 0 && s.upgradeable === 0,
      actionable: s.eligible_no_preview + s.upgradeable,
      label: 'Preview Derivatives',
      statsText:
        eligible > 0
          ? `${fmt(s.with_preview)} / ${fmt(eligible)} eligible have previews`
          : 'No preview-eligible assets',
      actionVerb: 'Regen',
    };
  },
  detailLines: (s) => {
    const lines: string[] = [];
    if (s.eligible_no_preview > 0)
      lines.push(`${fmt(s.eligible_no_preview)} need a first preview`);
    if (s.upgradeable > 0)
      lines.push(`${fmt(s.upgradeable)} below current cap (regen ≤ ${s.target_size}px)`);
    if (s.not_eligible > 0)
      lines.push(`${fmt(s.not_eligible)} below ${800}px source threshold (no preview by design)`);
    if (s.eligible_no_preview === 0 && s.upgradeable === 0 && s.total_assets > 0)
      lines.push(`All eligible assets have previews at ${s.target_size}px`);
    return lines;
  },
  resultMessage: (d) => {
    const parts: string[] = [];
    if (d.enqueued > 0) parts.push(`${d.enqueued} regen jobs enqueued`);
    if (d.skipped > 0) parts.push(`${d.skipped} skipped`);
    if (d.errors > 0) parts.push(`${d.errors} errors`);
    return parts.length > 0 ? parts.join(', ') : null;
  },
};

const formatConversionConfig: RowConfig<FormatConversionStats> = {
  statsEndpoint: '/assets/format-conversion-stats?target_format=webp',
  actionEndpoint: '/assets/convert-format?target_format=webp&quality=90&limit={limit}',
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
// MaintenanceRow — stats-based row with expandable detail
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// useMaintenanceTask — state + data fetching for one task in the new sidebar
// layout. Keeps batchSize inside the hook so each task owns its own knob.
// ---------------------------------------------------------------------------

function useMaintenanceTask<S>(
  config: RowConfig<S>,
  onRefresh: React.MutableRefObject<(() => Promise<void>)[]>,
) {
  const sizes = config.batchSizes ?? DEFAULT_BATCH_SIZES;
  const maxBatchSize = config.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;
  const storageKey = BATCH_SIZE_STORAGE_PREFIX + config.statsEndpoint;
  const fallback = config.defaultBatchSize ?? sizes[0];

  const [batchSize, setBatchSizeState] = useState<number>(() => {
    if (typeof window === 'undefined') return fallback;
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return fallback;
    const n = Number(stored);
    if (!Number.isFinite(n) || n < 1) return fallback;
    return Math.min(Math.floor(n), maxBatchSize);
  });

  const setBatchSize = useCallback(
    (next: number) => {
      const clamped = Math.max(1, Math.min(Math.floor(next), maxBatchSize));
      setBatchSizeState(clamped);
      try {
        window.localStorage.setItem(storageKey, String(clamped));
      } catch {
        // localStorage may be unavailable (private mode); ignore
      }
    },
    [storageKey, maxBatchSize],
  );

  const row = useMaintenanceRow(config, batchSize);

  useEffect(() => {
    const cbs = onRefresh.current;
    cbs.push(row.fetchStats);
    return () => {
      const idx = cbs.indexOf(row.fetchStats);
      if (idx >= 0) cbs.splice(idx, 1);
    };
  }, [row.fetchStats, onRefresh]);

  useEffect(() => {
    row.fetchStats();
  }, [row.fetchStats]);

  return { config, batchSize, setBatchSize, sizes, maxBatchSize, ...row };
}

type MaintenanceTask<S> = ReturnType<typeof useMaintenanceTask<S>>;

// ---------------------------------------------------------------------------
// MaintenanceTaskDetail — right-pane view for one task. Replaces the old
// compact row layout with a full-size detail view: big progress, breakdown,
// batch selector, action, result.
// ---------------------------------------------------------------------------

function MaintenanceTaskDetail<S>({ task }: { task: MaintenanceTask<S> }) {
  const { config, stats, loading, acting, result, runAction, batchSize, setBatchSize, sizes, maxBatchSize } = task;

  if (!stats) {
    return (
      <div className="flex items-center gap-3 py-8 px-6">
        <LoadingSpinner size="sm" />
        <span className="text-sm text-muted-foreground">{loading ? 'Loading stats…' : 'No data'}</span>
      </div>
    );
  }

  const info = config.extract(stats);
  const busy = loading || acting;
  const customBreakdown = config.renderBreakdown?.(stats);
  const details = customBreakdown ? [] : config.detailLines?.(stats) ?? [];
  const effectiveBatch = Math.min(batchSize, info.actionable);

  return (
    <div className="flex flex-col gap-5 p-6 max-w-2xl">
      {/* Header */}
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">{info.label}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">{info.statsText}</p>
        </div>
        <span
          className={`text-3xl font-bold tabular-nums ${
            info.complete ? 'text-green-600 dark:text-green-400' : 'text-foreground'
          }`}
        >
          {info.pct.toFixed(0)}%
        </span>
      </header>

      {/* Progress */}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${info.complete ? 'bg-green-500' : 'bg-accent'}`}
          style={{ width: `${info.pct}%` }}
        />
      </div>

      {/* Breakdown — custom takes precedence over default bullets */}
      {customBreakdown ?? (details.length > 0 && (
        <section className="rounded-md border border-border/60 bg-muted/20 px-4 py-3 space-y-1.5">
          <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Breakdown
          </h3>
          {details.map((line, i) => (
            <div key={i} className="text-xs flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-muted-foreground/40 shrink-0" />
              <span className="text-muted-foreground">{line}</span>
            </div>
          ))}
        </section>
      ))}

      {config.renderExtra?.(stats)}

      {/* Action */}
      <section className="flex flex-col gap-2">
        {info.complete ? (
          <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1.5">
            <Icon name="check" size={16} /> Complete
          </span>
        ) : info.actionable > 0 ? (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs text-muted-foreground">Batch size</label>
              <input
                type="number"
                min={1}
                max={maxBatchSize}
                step={1}
                value={batchSize}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) setBatchSize(n);
                }}
                disabled={busy}
                className="h-8 w-24 text-xs bg-transparent border border-border rounded px-2 text-foreground disabled:opacity-50 tabular-nums"
              />
              <Button onClick={runAction} disabled={busy} variant="primary" size="sm">
                {acting ? <LoadingSpinner size="xs" /> : `${info.actionVerb} ${fmt(effectiveBatch)}`}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {fmt(info.actionable)} actionable · max {fmt(maxBatchSize)}
              </span>
            </div>
            {sizes.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Quick</span>
                {sizes
                  .filter((s) => s <= maxBatchSize)
                  .map((s) => {
                    const active = s === batchSize;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setBatchSize(s)}
                        disabled={busy}
                        className={`h-6 min-w-[2.25rem] px-2 text-[11px] tabular-nums rounded border transition-colors disabled:opacity-50 ${
                          active
                            ? 'border-accent bg-accent text-accent-foreground'
                            : 'border-border bg-transparent hover:bg-muted/40 text-muted-foreground'
                        }`}
                      >
                        {fmt(s)}
                      </button>
                    );
                  })}
              </div>
            )}
          </>
        ) : (
          <span className="text-sm text-muted-foreground">No actionable items right now.</span>
        )}
      </section>

      {/* Result */}
      {result && (
        <div
          className={`flex items-center gap-2 text-xs px-3 py-2 rounded border ${
            result.isError
              ? 'text-red-600 dark:text-red-400 border-red-300/40 bg-red-500/5'
              : 'text-green-700 dark:text-green-400 border-green-300/40 bg-green-500/5'
          }`}
        >
          <Icon name={result.isError ? 'alertCircle' : 'check'} size={14} />
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
      const data = await maintPost<any>('/assets/backfill-thumbnails?limit=50&missing_only=true', SURFACE);
      if (data.generated > 0 || data.errors > 0) {
        const parts: string[] = [];
        parts.push(`${data.generated} regenerated`);
        if (data.skipped > 0) parts.push(`${data.skipped} skipped`);
        if (data.errors > 0) parts.push(`${data.errors} errors`);
        setResult({ message: parts.join(', ') });
      } else {
        setResult({ message: 'No missing thumbnails found' });
      }
    } catch (err) {
      setResult({ message: extractErrorMessage(err) || 'Failed to regenerate', isError: true });
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

interface StorageRootInfo {
  id: string;
  kind: string;
  label: string;
  detail: string | null;
  asset_count: number;
  size_bytes: number;
  size_human: string;
  is_archive_target: boolean;
  online: boolean | null;
  error: string | null;
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
  storage_roots: StorageRootInfo[];
  tiering_enabled: boolean;
}

interface RelocateStats {
  archive_configured: boolean;
  archive_root_id: string;
  candidate_count: number;
  candidate_bytes: number;
  candidate_human: string;
}

interface RelocateVideosResult {
  archive_configured: boolean;
  dry_run: boolean;
  moved: number;
  skipped: number;
  errors: number;
  freed_bytes: number;
  freed_human: string;
  would_move_bytes: number;
  would_move_human: string;
  error_ids: number[];
}

interface StorageRootConfigItem {
  id: string;
  kind: string;
  endpoint_url: string | null;
  bucket: string | null;
  access_key: string | null;
  region: string | null;
  presigned_ttl_seconds: number | null;
  has_secret: boolean;
}

interface StorageRootsConfig {
  roots: StorageRootConfigItem[];
  source: 'db' | 'env' | 'none' | string;
}

interface StorageRootTestResult {
  online: boolean;
  error: string | null;
}

interface StorageRootsList {
  roots: StorageRootInfo[];
  tiering_enabled: boolean;
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
  return (
    <DisclosureSection
      label={
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </span>
      }
      badge={count != null ? <span className="text-[10px] text-muted-foreground/50">({count})</span> : undefined}
      defaultOpen={defaultOpen}
      iconStyle="chevron"
      size="sm"
      headerClassName="px-3 hover:bg-muted/30 transition-colors"
      contentClassName=""
    >
      {children}
    </DisclosureSection>
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
      <div className="bg-blue-500 h-full" style={{ width: `${(data / total) * 100}%` }} title={`Data: ${humanBytes(data)}`} />
      <div className="bg-amber-400 h-full" style={{ width: `${(toast / total) * 100}%` }} title={`TOAST: ${humanBytes(toast)}`} />
      <div className="bg-gray-400 h-full" style={{ width: `${(index / total) * 100}%` }} title={`Indexes: ${humanBytes(index)}`} />
    </div>
  );
}

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Severity badge
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: string }) {
  const color: 'red' | 'orange' | 'blue' =
    severity === 'critical' ? 'red' : severity === 'warning' ? 'orange' : 'blue';
  return (
    <Badge color={color} className="text-[9px] uppercase tracking-wider px-1.5 py-0.5">
      {severity}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// StorageOverview
// ---------------------------------------------------------------------------

const STORAGE_OVERVIEW_KEY = '/assets/storage-overview';
const RELOCATE_STATS_KEY = '/assets/relocate-stats';

// The storage overview is an expensive recursive FS walk, so we don't want to
// re-run it on every panel reopen. Persist the last result to sessionStorage
// and serve it stale-while-revalidate: show it instantly, only re-scan in the
// background when it's older than the soft TTL (or the user hits Refresh).
const STORAGE_OVERVIEW_PERSIST_KEY = 'maintenance:storage-overview:v1';
const STORAGE_OVERVIEW_SOFT_TTL_MS = 5 * 60 * 1000;

// Module-scoped in-flight guard for the (expensive) storage scan. The Overview
// panel unmounts when you switch maintenance tabs, so bouncing back before the
// first scan finished used to remount and kick off a *second* concurrent walk.
// Holding the live promise here (outside the component) lets a remount — or a
// background revalidate colliding with itself — piggyback on the running scan.
// A force refresh won't reuse a non-force scan; it needs genuinely fresh data.
let inFlightOverviewScan: { force: boolean; promise: Promise<StorageOverviewData> } | null = null;

function readPersistedOverview(): { data: StorageOverviewData; at: number } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_OVERVIEW_PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.data && typeof parsed.at === 'number') return parsed;
  } catch {
    /* sessionStorage unavailable or corrupt — ignore */
  }
  return null;
}

function writePersistedOverview(data: StorageOverviewData): void {
  try {
    sessionStorage.setItem(
      STORAGE_OVERVIEW_PERSIST_KEY,
      JSON.stringify({ data, at: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Storage roots (tiered placement) — per-root sizes + online state, plus the
// "relocate videos to archive" action. Plan media-storage-tiering Phase H.
// ---------------------------------------------------------------------------

/** Small online/offline/unknown dot for a storage root's reachability. */
function RootStatusDot({ online }: { online: boolean | null }) {
  const cls =
    online === true ? 'bg-emerald-500' : online === false ? 'bg-red-500' : 'bg-neutral-400';
  const label = online === true ? 'online' : online === false ? 'offline' : 'unknown';
  return <span className={`w-2 h-2 rounded-full shrink-0 ${cls}`} title={label} />;
}

const RELOCATE_MEDIA_TYPES: { key: string; label: string }[] = [
  { key: 'video', label: 'Video' },
  { key: 'image', label: 'Image' },
  { key: 'audio', label: 'Audio' },
  { key: '3d_model', label: '3D' },
];

// Relocation criteria persist across panel reopen (component state would reset
// every mount, silently dropping a "Keep sets local" pin — a safety risk).
const RELOCATE_CRITERIA_KEY = 'maintenance:relocate-criteria:v1';
interface RelocateCriteria {
  mediaTypes: string[];
  minSizeMb: number;
  olderThanDays: number;
  excludeFavorites: boolean;
  excludeSetIds: number[];
  verifyHash: boolean;
}
const RELOCATE_CRITERIA_DEFAULTS: RelocateCriteria = {
  mediaTypes: ['video'],
  minSizeMb: 0,
  olderThanDays: 0,
  excludeFavorites: true,
  excludeSetIds: [],
  verifyHash: true,
};
function readRelocateCriteria(): RelocateCriteria {
  try {
    const raw = localStorage.getItem(RELOCATE_CRITERIA_KEY);
    if (!raw) return RELOCATE_CRITERIA_DEFAULTS;
    const p = JSON.parse(raw) as Partial<RelocateCriteria>;
    return {
      mediaTypes: Array.isArray(p.mediaTypes) ? p.mediaTypes : RELOCATE_CRITERIA_DEFAULTS.mediaTypes,
      minSizeMb: typeof p.minSizeMb === 'number' && Number.isFinite(p.minSizeMb) ? p.minSizeMb : 0,
      olderThanDays: typeof p.olderThanDays === 'number' && Number.isFinite(p.olderThanDays) ? p.olderThanDays : 0,
      excludeFavorites: typeof p.excludeFavorites === 'boolean' ? p.excludeFavorites : true,
      excludeSetIds: Array.isArray(p.excludeSetIds) ? p.excludeSetIds.filter((x): x is number => typeof x === 'number') : [],
      verifyHash: typeof p.verifyHash === 'boolean' ? p.verifyHash : true,
    };
  } catch {
    return RELOCATE_CRITERIA_DEFAULTS;
  }
}

function RelocateVideosAction({ onMoved }: { onMoved: () => void }) {
  const [stats, setStats] = useState<RelocateStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [limit, setLimit] = useState(50);
  // Relocation criteria (AND-ed), hydrated from the last session's selection.
  const initialCriteria = useMemo(readRelocateCriteria, []);
  const [mediaTypes, setMediaTypes] = useState<string[]>(initialCriteria.mediaTypes);
  const [minSizeMb, setMinSizeMb] = useState(initialCriteria.minSizeMb);
  const [olderThanDays, setOlderThanDays] = useState(initialCriteria.olderThanDays);
  // Pin favorites (user:favorite tag) to local by default — curated assets
  // shouldn't get shipped to the archive. Plan media-storage-tiering cp-i (i1).
  const [excludeFavorites, setExcludeFavorites] = useState(initialCriteria.excludeFavorites);
  // Pin members of these manual sets to local. Plan media-storage-tiering cp-i (i3).
  const [excludeSetIds, setExcludeSetIds] = useState<number[]>(initialCriteria.excludeSetIds);
  // Re-hash the archive copy and compare to asset.sha256 before deleting the
  // local blob (byte-level verify, not just size). Default ON — slower but the
  // strongest guarantee for irreplaceable originals. Apply-only (ignored on dry-run).
  const [verifyHash, setVerifyHash] = useState(initialCriteria.verifyHash);
  // Monotonic id so only the latest relocate-stats request applies its result.
  const statsReqIdRef = useRef(0);

  // Persist criteria so the selection (esp. Keep sets local) survives reopen.
  useEffect(() => {
    try {
      localStorage.setItem(
        RELOCATE_CRITERIA_KEY,
        JSON.stringify({ mediaTypes, minSizeMb, olderThanDays, excludeFavorites, excludeSetIds, verifyHash }),
      );
    } catch {
      /* localStorage unavailable — non-fatal */
    }
  }, [mediaTypes, minSizeMb, olderThanDays, excludeFavorites, excludeSetIds, verifyHash]);

  // Manual sets only — membership-based exclusion needs member rows; smart sets
  // (filter-derived) have none, so they can't be pinned by this path.
  const { sets } = useAssetSets();
  const manualSets = useMemo(
    () => sets.filter((s) => s.kind === 'manual'),
    [sets],
  );

  const criteriaQuery = useCallback(() => {
    const p = new URLSearchParams();
    if (mediaTypes.length) p.set('media_types', mediaTypes.join(','));
    if (minSizeMb > 0) p.set('min_size_mb', String(minSizeMb));
    if (olderThanDays > 0) p.set('older_than_days', String(olderThanDays));
    if (excludeFavorites) p.set('exclude_favorites', 'true');
    if (excludeSetIds.length) p.set('exclude_set_ids', excludeSetIds.join(','));
    return p.toString();
  }, [mediaTypes, minSizeMb, olderThanDays, excludeFavorites, excludeSetIds]);

  const toggleExcludeSet = useCallback((id: number) => {
    setExcludeSetIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const loadStats = useCallback(async () => {
    // Guard against out-of-order responses: when criteria change quickly, an
    // earlier (e.g. unfiltered) request can resolve AFTER a later filtered one
    // and clobber the preview back to the full match. Only the latest request
    // applies its result. Plan media-storage-tiering cp-i.
    const reqId = ++statsReqIdRef.current;
    try {
      const qs = criteriaQuery();
      const s = await maintGet<RelocateStats>(
        `${RELOCATE_STATS_KEY}${qs ? `?${qs}` : ''}`,
        SURFACE,
      );
      if (reqId === statsReqIdRef.current) setStats(s);
    } catch {
      /* surfaced via the row above; keep the action quiet */
    }
  }, [criteriaQuery]);

  // Re-price the candidate set whenever the criteria change.
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const toggleType = useCallback((key: string) => {
    setMediaTypes((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key],
    );
  }, []);

  const run = useCallback(
    async (dryRun: boolean) => {
      setBusy(true);
      setResult(null);
      try {
        const qs = criteriaQuery();
        const path = `/assets/relocate?limit=${limit}&dry_run=${dryRun}&verify_hash=${verifyHash}${qs ? `&${qs}` : ''}`;
        // A full batch (esp. with hash-verify, over the network) can run well
        // past the default client timeout; allow up to 10 min so one click
        // completes and reports a real result instead of a 30s timeout error.
        const data = await maintPost<RelocateVideosResult>(path, SURFACE, undefined, { timeoutMs: 600_000 });
        if (dryRun) {
          setResult({
            message:
              data.moved > 0
                ? `Would relocate ${data.moved} item(s) (${data.would_move_human})${data.skipped ? `, ${data.skipped} skipped` : ''}`
                : 'Nothing matches — nothing to relocate',
          });
        } else {
          const parts = [`${data.moved} relocated`];
          if (data.freed_bytes > 0) parts.push(`${data.freed_human} freed locally`);
          if (data.skipped) parts.push(`${data.skipped} skipped`);
          if (data.errors) parts.push(`${data.errors} errors`);
          setResult({ message: parts.join(', '), isError: data.errors > 0 && data.moved === 0 });
          onMoved();
        }
        await loadStats();
      } catch (err) {
        setResult({ message: extractErrorMessage(err) || 'Relocation failed', isError: true });
      } finally {
        setBusy(false);
      }
    },
    [criteriaQuery, limit, verifyHash, loadStats, onMoved],
  );

  const onApply = useCallback(() => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Relocate up to ${limit} matching original(s) to the archive root and delete the local copies (only when no other asset shares the file)? This streams to the archive store.`,
      )
    )
      return;
    run(false);
  }, [limit, run]);

  if (!stats) return null;

  const noArchive = !stats.archive_configured;
  const nothing = stats.candidate_count === 0;

  return (
    <div className="px-3 py-2 space-y-2">
      <div className="flex items-center gap-2 text-[11px]">
        <Icon name="archive" size={12} className="text-muted-foreground shrink-0" />
        <span className="text-muted-foreground flex-1">
          {nothing
            ? 'No local originals match these criteria'
            : `${fmt(stats.candidate_count)} original(s) on local (${stats.candidate_human}) match — eligible for archive`}
        </span>
      </div>

      {/* Criteria */}
      <div className="pl-5 space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Types</span>
          {RELOCATE_MEDIA_TYPES.map((t) => {
            const active = mediaTypes.includes(t.key);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => toggleType(t.key)}
                disabled={busy}
                className={`h-6 px-2 text-[11px] rounded border transition-colors disabled:opacity-50 ${
                  active
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-border bg-transparent hover:bg-muted/40 text-muted-foreground'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[10px] text-muted-foreground">Min size MB</label>
          <input
            type="number"
            min={0}
            // Show empty (not a sticky leading 0) when unset so typing reads clean.
            value={minSizeMb === 0 ? '' : minSizeMb}
            placeholder="0"
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') { setMinSizeMb(0); return; }
              const n = Number(raw);
              if (Number.isFinite(n)) setMinSizeMb(Math.max(0, Math.floor(n)));
            }}
            disabled={busy}
            className="h-6 w-16 text-[11px] bg-transparent border border-border rounded px-1.5 tabular-nums disabled:opacity-50"
          />
          <label className="text-[10px] text-muted-foreground">Older than (days)</label>
          <input
            type="number"
            min={0}
            value={olderThanDays === 0 ? '' : olderThanDays}
            placeholder="0"
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') { setOlderThanDays(0); return; }
              const n = Number(raw);
              if (Number.isFinite(n)) setOlderThanDays(Math.max(0, Math.floor(n)));
            }}
            disabled={busy}
            className="h-6 w-16 text-[11px] bg-transparent border border-border rounded px-1.5 tabular-nums disabled:opacity-50"
          />
          <span className="text-[10px] text-muted-foreground/60">0 = any</span>
        </div>
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={excludeFavorites}
            onChange={(e) => setExcludeFavorites(e.target.checked)}
            disabled={busy}
            className="h-3 w-3 disabled:opacity-50"
          />
          Never archive favorites (keep <code className="text-[9px]">user:favorite</code> on local)
        </label>
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={verifyHash}
            onChange={(e) => setVerifyHash(e.target.checked)}
            disabled={busy}
            className="h-3 w-3 disabled:opacity-50"
          />
          Verify hash before delete (re-hash the archive copy; slower, safest)
        </label>

        {manualSets.length > 0 && (
          <div className="flex items-start gap-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1 mt-1">
              Keep sets local
            </span>
            {manualSets.map((s) => {
              const active = excludeSetIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleExcludeSet(s.id)}
                  disabled={busy}
                  title={active ? `Members of "${s.name}" are pinned to local` : `Pin "${s.name}" members to local`}
                  className={`h-6 px-2 text-[11px] rounded border transition-colors disabled:opacity-50 ${
                    active
                      ? 'border-accent bg-accent text-accent-foreground'
                      : 'border-border bg-transparent hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {noArchive && !nothing && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 pl-5">
          No <code>archive</code> root configured yet — add one below to enable relocation.
        </p>
      )}
      {!nothing && (
        <div className="flex items-center gap-2 flex-wrap pl-5">
          <label className="text-[10px] text-muted-foreground">Batch</label>
          <input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) setLimit(Math.max(1, Math.min(500, Math.floor(n))));
            }}
            disabled={busy}
            className="h-6 w-16 text-[11px] bg-transparent border border-border rounded px-1.5 tabular-nums disabled:opacity-50"
          />
          <Button onClick={() => run(true)} disabled={busy} variant="outline" size="sm">
            {busy ? <Spinner className="w-3 h-3" /> : 'Preview'}
          </Button>
          <Button onClick={onApply} disabled={busy || noArchive} variant="primary" size="sm">
            Relocate {fmt(Math.min(limit, stats.candidate_count))}
          </Button>
        </div>
      )}
      {result && (
        <div
          className={`flex items-center gap-1.5 text-[11px] pl-5 ${
            result.isError ? 'text-red-500' : 'text-green-600 dark:text-green-400'
          }`}
        >
          <Icon name={result.isError ? 'alertCircle' : 'check'} size={12} />
          {result.message}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Restore (un-archive) — pull archived originals back to local. Reverse of the
// relocate action. Selection is by manual set and/or media type; the preview
// shows how much LOCAL disk the restore would CONSUME (important on low-disk
// machines). Plan media-storage-tiering (reversibility).
// ---------------------------------------------------------------------------

const RESTORE_STATS_KEY = '/assets/restore-stats';

interface RestoreStats {
  archive_configured: boolean;
  archive_root_id: string;
  candidate_count: number;
  candidate_bytes: number;
  candidate_human: string;
}

interface RestoreResult {
  archive_configured: boolean;
  dry_run: boolean;
  restored: number;
  skipped: number;
  errors: number;
  restored_bytes: number;
  restored_human: string;
  would_restore_bytes: number;
  would_restore_human: string;
  error_ids: number[];
}

function RestoreFromArchiveAction({ onChanged }: { onChanged: () => void }) {
  const [stats, setStats] = useState<RestoreStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [limit, setLimit] = useState(50);
  // Selection: which archived assets to pull back. Empty set+type = all archived.
  const [setIds, setSetIds] = useState<number[]>([]);
  const [mediaTypes, setMediaTypes] = useState<string[]>([]);
  // Re-hash the restored local copy before trusting it. Default ON.
  const [verifyHash, setVerifyHash] = useState(true);
  // Also drop the archive copy after restoring. Default OFF — keep the backup.
  const [deleteArchive, setDeleteArchive] = useState(false);
  const statsReqIdRef = useRef(0);

  const { sets } = useAssetSets();
  const manualSets = useMemo(() => sets.filter((s) => s.kind === 'manual'), [sets]);

  const criteriaQuery = useCallback(() => {
    const p = new URLSearchParams();
    if (setIds.length) p.set('set_ids', setIds.join(','));
    if (mediaTypes.length) p.set('media_types', mediaTypes.join(','));
    return p.toString();
  }, [setIds, mediaTypes]);

  const loadStats = useCallback(async () => {
    const reqId = ++statsReqIdRef.current;
    try {
      const qs = criteriaQuery();
      const s = await maintGet<RestoreStats>(
        `${RESTORE_STATS_KEY}${qs ? `?${qs}` : ''}`,
        SURFACE,
      );
      if (reqId === statsReqIdRef.current) setStats(s);
    } catch {
      /* surfaced elsewhere; keep quiet */
    }
  }, [criteriaQuery]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const toggleSet = useCallback((id: number) => {
    setSetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);
  const toggleType = useCallback((key: string) => {
    setMediaTypes((prev) => (prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]));
  }, []);

  const run = useCallback(
    async (dryRun: boolean) => {
      setBusy(true);
      setResult(null);
      try {
        const qs = criteriaQuery();
        const path = `/assets/restore?limit=${limit}&dry_run=${dryRun}&verify_hash=${verifyHash}&delete_archive=${deleteArchive}${qs ? `&${qs}` : ''}`;
        // Restores download from the archive; allow up to 10 min per batch.
        const data = await maintPost<RestoreResult>(path, SURFACE, undefined, { timeoutMs: 600_000 });
        if (dryRun) {
          setResult({
            message:
              data.restored > 0
                ? `Would restore ${data.restored} item(s) — ${data.would_restore_human} onto local${data.skipped ? `, ${data.skipped} skipped` : ''}`
                : 'Nothing matches — nothing to restore',
          });
        } else {
          const parts = [`${data.restored} restored`];
          if (data.restored_bytes > 0) parts.push(`${data.restored_human} added locally`);
          if (data.skipped) parts.push(`${data.skipped} skipped`);
          if (data.errors) parts.push(`${data.errors} errors`);
          setResult({ message: parts.join(', '), isError: data.errors > 0 && data.restored === 0 });
          onChanged();
        }
        await loadStats();
      } catch (err) {
        setResult({ message: extractErrorMessage(err) || 'Restore failed', isError: true });
      } finally {
        setBusy(false);
      }
    },
    [criteriaQuery, limit, verifyHash, deleteArchive, loadStats, onChanged],
  );

  const onApply = useCallback(() => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Restore up to ${limit} archived original(s) back to LOCAL disk${deleteArchive ? ' and delete the archive copy' : ''}? This downloads from the archive and consumes local space.`,
      )
    )
      return;
    run(false);
  }, [limit, deleteArchive, run]);

  if (!stats) return null;

  const noArchive = !stats.archive_configured;
  const nothing = stats.candidate_count === 0;

  return (
    <div className="px-3 py-2 space-y-2">
      <div className="flex items-center gap-2 text-[11px]">
        <Icon name="download" size={12} className="text-muted-foreground shrink-0" />
        <span className="text-muted-foreground flex-1">
          {nothing
            ? 'No archived originals match this selection'
            : `${fmt(stats.candidate_count)} archived original(s) match (${stats.candidate_human}) — restoring uses that much local disk`}
        </span>
      </div>

      {/* Selection */}
      <div className="pl-5 space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Types</span>
          {RELOCATE_MEDIA_TYPES.map((t) => {
            const active = mediaTypes.includes(t.key);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => toggleType(t.key)}
                disabled={busy}
                className={`h-6 px-2 text-[11px] rounded border transition-colors disabled:opacity-50 ${
                  active
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-border bg-transparent hover:bg-muted/40 text-muted-foreground'
                }`}
              >
                {t.label}
              </button>
            );
          })}
          <span className="text-[10px] text-muted-foreground/60">none = all types</span>
        </div>

        {manualSets.length > 0 && (
          <div className="flex items-start gap-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1 mt-1">
              From sets
            </span>
            {manualSets.map((s) => {
              const active = setIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSet(s.id)}
                  disabled={busy}
                  title={active ? `Restoring archived members of "${s.name}"` : `Restore archived members of "${s.name}"`}
                  className={`h-6 px-2 text-[11px] rounded border transition-colors disabled:opacity-50 ${
                    active
                      ? 'border-accent bg-accent text-accent-foreground'
                      : 'border-border bg-transparent hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        )}

        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={verifyHash}
            onChange={(e) => setVerifyHash(e.target.checked)}
            disabled={busy}
            className="h-3 w-3 disabled:opacity-50"
          />
          Verify hash after restore (re-hash the local copy; slower, safest)
        </label>
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={deleteArchive}
            onChange={(e) => setDeleteArchive(e.target.checked)}
            disabled={busy}
            className="h-3 w-3 disabled:opacity-50"
          />
          Also delete the archive copy (default keeps it as a backup)
        </label>
      </div>

      {noArchive && !nothing && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 pl-5">
          No <code>archive</code> root configured — nothing to restore from.
        </p>
      )}
      {!nothing && (
        <div className="flex items-center gap-2 flex-wrap pl-5">
          <label className="text-[10px] text-muted-foreground">Batch</label>
          <input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) setLimit(Math.max(1, Math.min(500, Math.floor(n))));
            }}
            disabled={busy}
            className="h-6 w-16 text-[11px] bg-transparent border border-border rounded px-1.5 tabular-nums disabled:opacity-50"
          />
          <Button onClick={() => run(true)} disabled={busy} variant="outline" size="sm">
            {busy ? <Spinner className="w-3 h-3" /> : 'Preview'}
          </Button>
          <Button onClick={onApply} disabled={busy || noArchive} variant="primary" size="sm">
            Restore {fmt(Math.min(limit, stats.candidate_count))}
          </Button>
        </div>
      )}
      {result && (
        <div
          className={`flex items-center gap-1.5 text-[11px] pl-5 ${
            result.isError ? 'text-red-500' : 'text-green-600 dark:text-green-400'
          }`}
        >
          <Icon name={result.isError ? 'alertCircle' : 'check'} size={12} />
          {result.message}
        </div>
      )}
    </div>
  );
}

const STORAGE_ROOTS_CONFIG_KEY = '/assets/storage-roots-config';

interface RootForm {
  id: string;
  endpoint_url: string;
  bucket: string;
  access_key: string;
  secret_key: string;
  region: string;
  presigned_ttl_seconds: number;
}

const EMPTY_ROOT_FORM: RootForm = {
  id: 'archive',
  endpoint_url: '',
  bucket: '',
  access_key: '',
  secret_key: '',
  region: 'us-east-1',
  presigned_ttl_seconds: 3600,
};

/** Add / edit / remove an S3-MinIO archive root, with a connection test. */
function StorageRootEditor({ onChanged }: { onChanged: () => void }) {
  const [config, setConfig] = useState<StorageRootsConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RootForm>(EMPTY_ROOT_FORM);
  const [editingExisting, setEditingExisting] = useState(false);
  const [testResult, setTestResult] = useState<StorageRootTestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      setConfig(await maintGet<StorageRootsConfig>(STORAGE_ROOTS_CONFIG_KEY, SURFACE));
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const startAdd = useCallback(() => {
    setForm(EMPTY_ROOT_FORM);
    setEditingExisting(false);
    setTestResult(null);
    setResult(null);
    setOpen(true);
  }, []);

  const startEdit = useCallback((r: StorageRootConfigItem) => {
    setForm({
      id: r.id,
      endpoint_url: r.endpoint_url ?? '',
      bucket: r.bucket ?? '',
      access_key: r.access_key ?? '',
      secret_key: '', // never returned; blank = keep stored secret
      region: r.region ?? 'us-east-1',
      presigned_ttl_seconds: r.presigned_ttl_seconds ?? 3600,
    });
    setEditingExisting(true);
    setTestResult(null);
    setResult(null);
    setOpen(true);
  }, []);

  const patch = useCallback(
    (p: Partial<RootForm>) => setForm((f) => ({ ...f, ...p })),
    [],
  );

  const runTest = useCallback(async () => {
    setBusy(true);
    setTestResult(null);
    setResult(null);
    try {
      const res = await maintPost<StorageRootTestResult>('/assets/storage-roots/test', SURFACE, {
        id: form.id,
        endpoint_url: form.endpoint_url,
        bucket: form.bucket,
        access_key: form.access_key,
        secret_key: form.secret_key || undefined,
        region: form.region,
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({ online: false, error: extractErrorMessage(err) || 'Test failed' });
    } finally {
      setBusy(false);
    }
  }, [form]);

  const save = useCallback(async () => {
    setBusy(true);
    setResult(null);
    try {
      const updated = await maintPut<StorageRootsConfig>(
        '/assets/storage-roots',
        {
          id: form.id || 'archive',
          kind: 's3',
          endpoint_url: form.endpoint_url,
          bucket: form.bucket,
          access_key: form.access_key,
          secret_key: form.secret_key || undefined,
          region: form.region,
          presigned_ttl_seconds: form.presigned_ttl_seconds,
        },
        SURFACE,
      );
      setConfig(updated);
      setOpen(false);
      setResult({ message: `Saved root '${form.id}'` });
      onChanged();
    } catch (err) {
      setResult({ message: extractErrorMessage(err) || 'Save failed', isError: true });
    } finally {
      setBusy(false);
    }
  }, [form, onChanged]);

  const remove = useCallback(
    async (id: string) => {
      if (typeof window !== 'undefined' && !window.confirm(
        `Remove storage root '${id}'? Assets already on it keep their placement and will read as archived-offline until the root is restored.`,
      )) return;
      setBusy(true);
      setResult(null);
      try {
        const updated = await maintDelete<StorageRootsConfig>(
          `/assets/storage-roots/${encodeURIComponent(id)}`,
          SURFACE,
        );
        setConfig(updated);
        setResult({ message: `Removed root '${id}'` });
        onChanged();
      } catch (err) {
        setResult({ message: extractErrorMessage(err) || 'Remove failed', isError: true });
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  const extras = config?.roots ?? [];
  const envSourced = config?.source === 'env';

  return (
    <div className="px-3 py-2 space-y-2 border-t border-border/40">
      <div className="flex items-center gap-2">
        <Icon name="settings" size={12} className="text-muted-foreground shrink-0" />
        <span className="text-[11px] text-muted-foreground flex-1">Manage roots</span>
        {!open && (
          <Button onClick={startAdd} variant="outline" size="sm">
            {extras.length ? 'Add another' : 'Add archive root'}
          </Button>
        )}
      </div>

      {/* Existing editable roots (DB-managed) */}
      {!open && extras.map((r) => (
        <div key={r.id} className="flex items-center gap-2 text-[11px] pl-5">
          <span className="font-medium">{r.id}</span>
          <span className="text-muted-foreground/70 truncate flex-1" title={`${r.endpoint_url ?? ''}/${r.bucket ?? ''}`}>
            {(r.endpoint_url ?? '').replace(/^https?:\/\//, '')}/{r.bucket ?? ''}
          </span>
          {envSourced && <span className="text-[9px] text-amber-600 dark:text-amber-400">from .env</span>}
          <button
            type="button"
            onClick={() => startEdit(r)}
            className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
          >
            Edit
          </button>
          {!envSourced && (
            <button
              type="button"
              onClick={() => remove(r.id)}
              disabled={busy}
              className="text-[10px] text-red-500 hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {envSourced && !open && (
        <p className="text-[10px] text-muted-foreground/70 pl-5">
          Roots are currently from <code>.env</code>. Saving here creates a DB override that supersedes it (re-enter the secret).
        </p>
      )}

      {/* Add/edit form */}
      {open && (
        <div className="pl-5 space-y-1.5">
          <div className="grid grid-cols-[80px_1fr] items-center gap-x-2 gap-y-1.5 text-[11px]">
            <label className="text-muted-foreground">Root id</label>
            <input
              value={form.id}
              onChange={(e) => patch({ id: e.target.value })}
              disabled={editingExisting || busy}
              className="h-7 bg-transparent border border-border rounded px-2 disabled:opacity-50"
            />
            <label className="text-muted-foreground">Endpoint</label>
            <input
              placeholder="http://10.243.1.2:9000"
              value={form.endpoint_url}
              onChange={(e) => patch({ endpoint_url: e.target.value })}
              disabled={busy}
              className="h-7 bg-transparent border border-border rounded px-2"
            />
            <label className="text-muted-foreground">Bucket</label>
            <input
              placeholder="pixsim-archive"
              value={form.bucket}
              onChange={(e) => patch({ bucket: e.target.value })}
              disabled={busy}
              className="h-7 bg-transparent border border-border rounded px-2"
            />
            <label className="text-muted-foreground">Access key</label>
            <input
              value={form.access_key}
              onChange={(e) => patch({ access_key: e.target.value })}
              disabled={busy}
              className="h-7 bg-transparent border border-border rounded px-2"
            />
            <label className="text-muted-foreground">Secret key</label>
            <input
              type="password"
              placeholder={editingExisting ? '•••• (unchanged)' : ''}
              value={form.secret_key}
              onChange={(e) => patch({ secret_key: e.target.value })}
              disabled={busy}
              className="h-7 bg-transparent border border-border rounded px-2"
            />
            <label className="text-muted-foreground">Region</label>
            <input
              value={form.region}
              onChange={(e) => patch({ region: e.target.value })}
              disabled={busy}
              className="h-7 bg-transparent border border-border rounded px-2"
            />
          </div>

          {testResult && (
            <div
              className={`flex items-center gap-1.5 text-[11px] ${
                testResult.online ? 'text-green-600 dark:text-green-400' : 'text-red-500'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${testResult.online ? 'bg-emerald-500' : 'bg-red-500'}`} />
              {testResult.online ? 'Connection OK' : `Unreachable: ${testResult.error ?? 'unknown error'}`}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button onClick={runTest} disabled={busy || !form.endpoint_url || !form.bucket} variant="outline" size="sm">
              {busy ? <Spinner className="w-3 h-3" /> : 'Test connection'}
            </Button>
            <Button onClick={save} disabled={busy || !form.endpoint_url || !form.bucket || !form.access_key} variant="primary" size="sm">
              Save
            </Button>
            <button
              type="button"
              onClick={() => { setOpen(false); setTestResult(null); }}
              disabled={busy}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <div
          className={`flex items-center gap-1.5 text-[11px] pl-5 ${
            result.isError ? 'text-red-500' : 'text-green-600 dark:text-green-400'
          }`}
        >
          <Icon name={result.isError ? 'alertCircle' : 'check'} size={12} />
          {result.message}
        </div>
      )}
    </div>
  );
}

const STORAGE_ROOTS_LIST_KEY = '/assets/storage-roots';

/**
 * Dedicated "Storage Tiering" panel — its own sidebar section, self-fetching
 * the cheap /assets/storage-roots endpoint (no FS scan). Hosts the per-root
 * sizes/health list, the relocate action, and the add/edit-root editor.
 */
function StorageTieringPanel() {
  const [data, setData] = useState<StorageRootsList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (force = false) => {
    if (!force) {
      const cached = readStatsCache<StorageRootsList>(STORAGE_ROOTS_LIST_KEY);
      if (cached) {
        setData(cached);
        setError(null);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const resp = await maintGet<StorageRootsList>(STORAGE_ROOTS_LIST_KEY, SURFACE);
      writeStatsCache(STORAGE_ROOTS_LIST_KEY, resp);
      setData(resp);
    } catch (err) {
      setError(extractErrorMessage(err) || 'Failed to load storage roots');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(() => {
    bustStatsCache(STORAGE_ROOTS_LIST_KEY);
    // Also bust the overview scan so its roots summary stays in sync.
    bustStatsCache(STORAGE_OVERVIEW_KEY);
    fetchData(true);
  }, [fetchData]);

  const roots = data?.roots ?? [];
  const maxBytes = Math.max(1, ...roots.map((r) => r.size_bytes));

  return (
    <div className="flex flex-col gap-4 p-5 max-w-2xl">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Storage Tiering</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Offload heavy video originals to a remote S3/MinIO archive; images and derivatives stay local.
          </p>
        </div>
        <Button onClick={refresh} disabled={loading} variant="outline" size="sm">
          {loading ? <LoadingSpinner size="xs" /> : <Icon name="refresh" size={12} />}
        </Button>
      </header>

      {error && !data && (
        <div className="flex items-center gap-2 text-[11px] text-red-500">
          <Icon name="alertCircle" size={14} /> {error}
        </div>
      )}

      {data && (
        <>
          {/* Per-root sizes + health */}
          <section className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 space-y-1.5">
            <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Roots
            </h3>
            {roots.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-[11px]">
                <RootStatusDot online={r.online} />
                <span className="w-[100px] shrink-0 truncate text-muted-foreground" title={r.detail ?? undefined}>
                  {r.label}
                </span>
                <span className="w-[34px] shrink-0 text-[9px] uppercase tracking-wider text-muted-foreground/50">
                  {r.kind}
                </span>
                <span className="w-[60px] shrink-0 text-right tabular-nums">{r.size_human}</span>
                <MiniBar value={r.size_bytes} total={maxBytes} color={r.id === 'local' ? 'bg-blue-500' : 'bg-emerald-500'} />
                <span className="w-[60px] shrink-0 text-right text-muted-foreground/60 tabular-nums text-[10px]">
                  {fmtCount(r.asset_count)} files
                </span>
                {r.is_archive_target && (
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium shrink-0">target</span>
                )}
              </div>
            ))}
            {roots.some((r) => r.online === false) && (
              <p className="text-[10px] text-red-500 pt-0.5">
                An archive root is offline — archived media returns a clear “offline” state until it’s reachable.
              </p>
            )}
            {!data.tiering_enabled && (
              <p className="text-[10px] text-muted-foreground/70 pt-0.5">
                Only the local root is configured. Add an archive root below to enable tiering.
              </p>
            )}
          </section>

          {/* Relocate action */}
          <section className="rounded-md border border-border/60 bg-muted/20">
            <RelocateVideosAction onMoved={refresh} />
          </section>

          {/* Restore (un-archive) action */}
          <section className="rounded-md border border-border/60 bg-muted/20">
            <RestoreFromArchiveAction onChanged={refresh} />
          </section>

          {/* Add / edit / remove roots */}
          <section className="rounded-md border border-border/60 bg-muted/20">
            <StorageRootEditor onChanged={refresh} />
          </section>
        </>
      )}
    </div>
  );
}

function StorageOverview({
  onRefresh,
  onNavigate,
}: {
  onRefresh: React.MutableRefObject<(() => Promise<void>)[]>;
  onNavigate?: (id: string) => void;
}) {
  const [data, setData] = useState<StorageOverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);

  const fetchData = useCallback(async (force = false) => {
    // Stale-while-revalidate. Show whatever we already have (memory or
    // sessionStorage) instantly, and only hit the backend (which runs the FS
    // walk) when there's nothing cached, the cache is stale, or force=true.
    const memory = readStatsCache<StorageOverviewData>(STORAGE_OVERVIEW_KEY);
    const persisted = memory ? { data: memory, at: Date.now() } : readPersistedOverview();
    if (persisted && !force) {
      setData(persisted.data);
      setError(null);
      writeStatsCache(STORAGE_OVERVIEW_KEY, persisted.data); // keep memory warm
      if (Date.now() - persisted.at < STORAGE_OVERVIEW_SOFT_TTL_MS) {
        return; // fresh enough — no scan
      }
      // Stale: fall through and revalidate in the background (no blocking spinner).
    }

    const hadData = Boolean(persisted);
    if (!hadData) setLoading(true);
    setError(null);
    // Reuse a running scan across remounts; only start a new request when none
    // is in flight (or when a force refresh needs to supersede a non-force one).
    if (!inFlightOverviewScan || (force && !inFlightOverviewScan.force)) {
      // force re-scans the backend too (bypasses its own 60s cache).
      const path = force ? `${STORAGE_OVERVIEW_KEY}?force=true` : STORAGE_OVERVIEW_KEY;
      inFlightOverviewScan = { force, promise: maintGet<StorageOverviewData>(path, SURFACE) };
    }
    const scan = inFlightOverviewScan;
    try {
      const resp = await scan.promise;
      writeStatsCache(STORAGE_OVERVIEW_KEY, resp);
      writePersistedOverview(resp);
      setData(resp);
    } catch (err) {
      // Don't blow away already-shown data on a background-revalidate failure.
      if (!hadData) setError(extractErrorMessage(err) || 'Failed to load storage overview');
    } finally {
      if (inFlightOverviewScan === scan) inFlightOverviewScan = null;
      setLoading(false);
    }
  }, []);

  // Refresh button / global refresh forces a fresh scan.
  const revalidate = useCallback(() => fetchData(true), [fetchData]);

  useEffect(() => {
    const cbs = onRefresh.current;
    cbs.push(revalidate);
    return () => {
      const idx = cbs.indexOf(revalidate);
      if (idx >= 0) cbs.splice(idx, 1);
    };
  }, [revalidate, onRefresh]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const runCleanupAction = useCallback(async (endpoint: string, id: string) => {
    setRunningAction(id);
    setActionResult(null);
    try {
      const result = await maintPost<any>(endpoint, SURFACE);
      const msg = result.dry_run
        ? `Dry run: ${result.freed_human || result.deleted_count + ' items'} would be freed`
        : `Done: ${result.freed_human || ''} freed`;
      setActionResult({ message: msg });
      // Refresh after non-dry-run — force a fresh scan (state actually changed).
      if (!result.dry_run) {
        bustStatsCache(STORAGE_OVERVIEW_KEY);
        fetchData(true);
      }
    } catch (err) {
      setActionResult({ message: extractErrorMessage(err) || 'Action failed', isError: true });
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

      {/* Storage tiering lives in its own sidebar section now — keep just a
          compact summary + pointer here so the Overview isn't cluttered. */}
      {(data.storage_roots?.length ?? 0) > 0 && (
        <>
          <div className="h-px bg-border/50 mx-3" />
          <button
            type="button"
            onClick={() => onNavigate?.('storage-tiering')}
            className="w-full flex items-center gap-2 px-3 py-2 text-[11px] hover:bg-muted/30 transition-colors text-left"
          >
            <Icon name="database" size={12} className="text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Storage tiering</span>
            <span className="text-muted-foreground/60 truncate">
              {data.storage_roots.map((r) => `${r.label} ${r.size_human}`).join(' · ')}
            </span>
            {data.storage_roots.some((r) => r.online === false) && (
              <span className="text-[9px] text-red-500 shrink-0">offline</span>
            )}
            <span className="ml-auto text-accent shrink-0">Manage →</span>
          </button>
        </>
      )}

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
              <div key={`${mt.mime_type}::${mt.media_type}`} className="flex items-center gap-2 text-[11px]">
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
                {data.unused_indexes.length} unused indexes ({humanBytes(data.unused_indexes.reduce((s, i) => s + i.size_bytes, 0))})
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

/** Sidebar section entry metadata (icon + label decoupled from the row's extract() call). */
interface TaskNavEntry {
  id: string;
  label: string;
  icon: IconName;
}

const STATS_TASK_NAV: readonly TaskNavEntry[] = [
  { id: 'sha',           label: 'SHA256 Hashes',    icon: 'hash' },
  { id: 'storage',       label: 'Content Storage',  icon: 'database' },
  { id: 'content',       label: 'Content Links',    icon: 'link' },
  { id: 'upload-method', label: 'Upload Method',    icon: 'upload' },
  { id: 'folder',        label: 'Folder Context',   icon: 'folderTree' },
  { id: 'previews',      label: 'Preview Derivatives', icon: 'zoomIn' },
  { id: 'format',        label: 'Format Conversion', icon: 'image' },
  { id: 'signal',        label: 'Signal Scan',      icon: 'alertTriangle' },
];

/** Sidebar progress badge — shows % (or a ✓ when complete) next to the task name. */
function TaskPctBadge<S>({ task }: { task: MaintenanceTask<S> }) {
  if (!task.stats) return <span className="text-[10px] text-muted-foreground/40">…</span>;
  const info = task.config.extract(task.stats);
  if (info.complete) {
    return <Icon name="check" size={12} className="text-green-600 dark:text-green-400" />;
  }
  return (
    <span className="text-[10px] text-muted-foreground tabular-nums">{info.pct.toFixed(0)}%</span>
  );
}

export function MaintenanceDashboard() {
  const refreshCallbacks = useRef<(() => Promise<void>)[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeId, setActiveId] = useState<string>('overview');

  // One hook per RowConfig — all fire in parallel on mount, so sidebar badges
  // populate as stats come back.
  const taskMap = {
    sha:             useMaintenanceTask(shaConfig, refreshCallbacks),
    storage:         useMaintenanceTask(storageConfig, refreshCallbacks),
    content:         useMaintenanceTask(contentConfig, refreshCallbacks),
    'upload-method': useMaintenanceTask(uploadMethodConfig, refreshCallbacks),
    folder:          useMaintenanceTask(folderContextConfig, refreshCallbacks),
    previews:        useMaintenanceTask(previewBackfillConfig, refreshCallbacks),
    format:          useMaintenanceTask(formatConversionConfig, refreshCallbacks),
    signal:          useMaintenanceTask(signalScanConfig, refreshCallbacks),
  } as const;

  const refreshAll = async () => {
    setRefreshing(true);
    useAsyncTaskStore.getState().clearAll('maintenance:');
    bustStatsCache();
    await Promise.allSettled(refreshCallbacks.current.map((cb) => cb()));
    setRefreshing(false);
  };

  const byTask = useAsyncTaskStore((s) => s.byTask);

  const sections: SidebarContentLayoutSection[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: <Icon name="layers" size={14} />,
    },
    {
      id: 'storage-tiering',
      label: 'Storage Tiering',
      icon: <Icon name="database" size={14} />,
    },
    ...STATS_TASK_NAV.map((entry) => {
      const taskEntry = taskMap[entry.id as keyof typeof taskMap];
      const isRunning = byTask[taskEntry.taskId]?.status === 'running';
      return {
        id: entry.id,
        label: entry.label,
        icon: isRunning ? <LoadingSpinner size="xs" /> : <Icon name={entry.icon} size={14} />,
      };
    }),
    {
      id: 'provider-concurrency',
      label: 'Provider Concurrency',
      icon: <Icon name="gauge" size={14} />,
    },
    {
      id: 'duplicates',
      label: 'Duplicates',
      icon: <Icon name="copy" size={14} />,
    },
    {
      id: 'thumbnails',
      label: 'Thumbnails',
      icon: <Icon name="image" size={14} />,
    },
    {
      id: 'error-types',
      label: 'Error Types',
      icon: <Icon name="alertTriangle" size={14} />,
    },
  ];

  // Each task hook is MaintenanceTask<S> for a different S; the generic detail
  // components only need a consistent (task.config + task.stats) pairing, so a
  // single `any` instantiation is sound and avoids a union-vs-generic mismatch.
  const activeTask: MaintenanceTask<any> | null =
    activeId in taskMap ? (taskMap[activeId as keyof typeof taskMap] as MaintenanceTask<any>) : null;

  return (
    <SidebarContentLayout
      sections={sections}
      activeSectionId={activeId}
      onSelectSection={setActiveId}
      sidebarTitle={
        <div className="flex items-center justify-between w-full gap-2 pr-2">
          <span className="text-xs font-medium">Maintenance</span>
          <Button onClick={refreshAll} disabled={refreshing} variant="outline" size="sm">
            {refreshing ? <LoadingSpinner size="xs" /> : <Icon name="refresh" size={12} />}
          </Button>
        </div>
      }
      sidebarWidth="w-52"
      resizable
      persistKey="maintenance-dashboard-sidebar"
      className="h-full"
      contentClassName="overflow-auto"
    >
      {/* Per-entry badges rendered via a sibling element layer. The nav itself
          only takes label+icon, so we render badges inside each detail pane's
          header via the TaskPctBadge helper — keeping the sidebar purely nav. */}

      {activeId === 'overview' && (
        <div className="flex flex-col gap-0">
          <HealthHeader />
          <div className="h-px bg-border mx-3" />
          <StorageOverview onRefresh={refreshCallbacks} onNavigate={setActiveId} />
        </div>
      )}

      {activeId === 'storage-tiering' && <StorageTieringPanel />}

      {activeTask && (
        <div className="flex flex-col">
          <div className="flex items-center gap-2 px-6 pt-4">
            <TaskPctBadge task={activeTask} />
          </div>
          <MaintenanceTaskDetail task={activeTask} />
        </div>
      )}

      {activeId === 'provider-concurrency' && <ProviderConcurrencyRow />}

      {activeId === 'duplicates' && (
        <div className="p-4">
          <DuplicatesRow onRefresh={refreshCallbacks} />
        </div>
      )}

      {activeId === 'thumbnails' && (
        <div className="p-4">
          <ThumbnailRow onRefresh={refreshCallbacks} />
        </div>
      )}

      {activeId === 'error-types' && <ErrorCatalogRow />}
    </SidebarContentLayout>
  );
}

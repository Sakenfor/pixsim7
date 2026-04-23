/**
 * DuplicatesRow — maintenance dashboard row for sha256-based duplicate groups.
 *
 * Shows aggregate stats (group count, reclaimable bytes) and expands to list
 * each group with thumbnails. User picks which copies to delete per group.
 */

import { Button, useToast } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useState } from 'react';

import { deleteAsset } from '@lib/api/assets';
import { withCorrelationHeaders } from '@lib/api/correlationHeaders';
import { authService } from '@lib/auth';

import { useAuthenticatedMedia } from '@/hooks/useAuthenticatedMedia';

// ── Types ─────────────────────────────────────────────────────────────

interface DuplicatesStats {
  group_count: number;
  total_duplicates: number;
  wasted_bytes: number;
}

interface DuplicateAssetInfo {
  id: number;
  created_at: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  media_type: string | null;
  upload_method: string | null;
  asset_kind: string | null;
  source_folder: string | null;
  source_relative_path: string | null;
  thumbnail_url: string | null;
}

interface DuplicateGroup {
  sha256: string;
  count: number;
  total_bytes: number;
  assets: DuplicateAssetInfo[];
}

interface DuplicatesResponse {
  groups: DuplicateGroup[];
  total_groups: number;
  offset: number;
  limit: number;
}

// ── API helpers ───────────────────────────────────────────────────────

function apiBase() {
  // Empty = relative mode (proxy handles routing). Undefined = hardcoded fallback.
  const url = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';
  return url.replace(/\/$/, '');
}

function authHeaders(): Record<string, string> {
  const token = authService.getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: withCorrelationHeaders(authHeaders(), 'settings:duplicates'),
  });
  if (!res.ok) {
    throw new Error((await res.text()) || res.statusText);
  }
  return res.json();
}

// ── Formatting ────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString();
}

function humanBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

// ── Small UI bits ─────────────────────────────────────────────────────

function Spinner({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin text-muted-foreground`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

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

function DuplicateThumbnail({
  thumbnailUrl,
  mediaType,
}: {
  thumbnailUrl: string | null;
  mediaType: string | null;
}) {
  const { src, loading } = useAuthenticatedMedia(thumbnailUrl ?? undefined, { mediaType: 'image' });

  if (src) {
    return <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />;
  }
  if (loading) {
    return <Spinner className="w-3 h-3" />;
  }
  return <span className="text-[9px] text-muted-foreground">{mediaType || '?'}</span>;
}

// ── Group card ────────────────────────────────────────────────────────

function DuplicateGroupCard({
  group,
  onAssetDeleted,
}: {
  group: DuplicateGroup;
  onAssetDeleted: (sha256: string, assetId: number) => void;
}) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);

  const handleDelete = useCallback(
    async (id: number) => {
      if (busyId != null) return;
      if (!confirm(`Delete asset #${id}? This cannot be undone.`)) return;
      setBusyId(id);
      try {
        await deleteAsset(id);
        onAssetDeleted(group.sha256, id);
        toast.success(`Deleted asset #${id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete asset');
      } finally {
        setBusyId(null);
      }
    },
    [busyId, group.sha256, onAssetDeleted, toast]
  );

  return (
    <div className="border border-border/50 rounded mb-2 overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/30 text-[11px]">
        <span className="font-mono text-muted-foreground tabular-nums">
          {group.sha256.slice(0, 10)}…
        </span>
        <span className="text-muted-foreground">
          {group.count} copies · {humanBytes(group.total_bytes)}
        </span>
      </div>

      <div className="divide-y divide-border/30">
        {group.assets.map((asset, idx) => {
          const isOldest = idx === 0;
          return (
            <div
              key={asset.id}
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/20"
            >
              {/* Thumbnail */}
              <div className="w-10 h-10 shrink-0 bg-muted rounded overflow-hidden flex items-center justify-center">
                <DuplicateThumbnail
                  thumbnailUrl={asset.thumbnail_url}
                  mediaType={asset.media_type}
                />
              </div>

              {/* Asset info */}
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="font-medium tabular-nums">#{asset.id}</span>
                  {isOldest && (
                    <span className="text-[9px] uppercase tracking-wider text-green-600 dark:text-green-400 bg-green-500/10 px-1 rounded">
                      oldest
                    </span>
                  )}
                  {asset.asset_kind && asset.asset_kind !== 'content' && (
                    <span className="text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1 rounded">
                      {asset.asset_kind}
                    </span>
                  )}
                  <span className="text-muted-foreground">{shortDate(asset.created_at)}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {humanBytes(asset.file_size_bytes || 0)}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {asset.upload_method || '—'}
                  {asset.source_folder ? ` · ${asset.source_folder}` : ''}
                  {asset.source_relative_path ? ` / ${asset.source_relative_path}` : ''}
                </div>
              </div>

              {/* Actions */}
              <div className="shrink-0">
                <Button
                  onClick={() => handleDelete(asset.id)}
                  disabled={busyId != null}
                  variant="outline"
                  size="sm"
                  className="text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/10"
                >
                  {busyId === asset.id ? <Spinner className="w-3 h-3" /> : 'Delete'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main row ──────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export function DuplicatesRow({
  onRefresh,
}: {
  onRefresh: React.MutableRefObject<(() => Promise<void>)[]>;
}) {
  const [stats, setStats] = useState<DuplicatesStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [offset, setOffset] = useState(0);
  const [totalGroups, setTotalGroups] = useState(0);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await apiFetch<DuplicatesStats>('/api/v1/assets/duplicates-stats');
      setStats(data);
      setStatsError(null);
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'Failed to load duplicate stats');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchGroups = useCallback(async (nextOffset: number) => {
    setGroupsLoading(true);
    try {
      const data = await apiFetch<DuplicatesResponse>(
        `/api/v1/assets/duplicates?offset=${nextOffset}&limit=${PAGE_SIZE}`
      );
      setGroups((prev) => (nextOffset === 0 ? data.groups : [...prev, ...data.groups]));
      setTotalGroups(data.total_groups);
      setOffset(nextOffset + data.groups.length);
      setGroupsError(null);
    } catch (err) {
      setGroupsError(err instanceof Error ? err.message : 'Failed to load duplicates');
    } finally {
      setGroupsLoading(false);
    }
  }, []);

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

  const toggleExpanded = useCallback(() => {
    setExpanded((e) => {
      const next = !e;
      if (next && groups.length === 0) {
        fetchGroups(0);
      }
      return next;
    });
  }, [fetchGroups, groups.length]);

  const handleAssetDeleted = useCallback(
    (sha256: string, assetId: number) => {
      setGroups((prev) => {
        const next: DuplicateGroup[] = [];
        for (const g of prev) {
          if (g.sha256 !== sha256) {
            next.push(g);
            continue;
          }
          const remaining = g.assets.filter((a) => a.id !== assetId);
          if (remaining.length >= 2) {
            next.push({ ...g, count: remaining.length, assets: remaining });
          }
          // If only 1 left, it's no longer a dup group — drop it
        }
        return next;
      });
      fetchStats();
    },
    [fetchStats]
  );

  const hasMore = offset < totalGroups;

  // Header stats
  const headerStatus = stats
    ? stats.group_count === 0
      ? 'No duplicates'
      : `${fmt(stats.group_count)} groups · ${fmt(stats.total_duplicates)} extra · ${humanBytes(stats.wasted_bytes)}`
    : statsLoading
      ? 'Loading…'
      : statsError
        ? 'Error'
        : '—';

  const complete = stats?.group_count === 0;
  const canExpand = (stats?.group_count ?? 0) > 0;

  return (
    <div>
      {/* Main row */}
      <div
        className={`flex items-center gap-3 py-2 px-3 ${canExpand ? 'cursor-pointer hover:bg-muted/30 transition-colors' : ''}`}
        onClick={canExpand ? toggleExpanded : undefined}
      >
        <div className="w-3 shrink-0">{canExpand && <Chevron expanded={expanded} />}</div>
        <span className="text-xs font-medium w-[110px] shrink-0 truncate">Duplicates</span>
        <span className="text-xs text-muted-foreground flex-1 truncate">{headerStatus}</span>
        <div className="w-[130px] shrink-0 flex justify-end">
          {complete ? (
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <span className="text-[10px] text-muted-foreground">
              {statsLoading ? <Spinner className="w-3 h-3" /> : 'Review'}
            </span>
          )}
        </div>
      </div>

      {/* Expanded group list */}
      {expanded && canExpand && (
        <div className="px-3 pb-3 pl-[30px]">
          {groupsError && (
            <div className="text-[11px] text-red-500 mb-2">{groupsError}</div>
          )}

          {groups.map((g) => (
            <DuplicateGroupCard key={g.sha256} group={g} onAssetDeleted={handleAssetDeleted} />
          ))}

          {groupsLoading && (
            <div className="flex items-center gap-2 py-2">
              <Spinner />
              <span className="text-[11px] text-muted-foreground">Loading…</span>
            </div>
          )}

          {!groupsLoading && hasMore && (
            <Button onClick={() => fetchGroups(offset)} variant="outline" size="sm">
              Load {Math.min(PAGE_SIZE, totalGroups - offset)} more ({offset}/{totalGroups})
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

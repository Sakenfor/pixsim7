/**
 * Content Packs Dashboard
 *
 * Admin widget showing content pack inventory (active vs orphaned)
 * with purge actions for orphaned packs (DB entities from packs
 * no longer on disk).
 */

import type { ContentPackInfo, ContentPackInventory } from '@pixsim7/shared.api.client/domains';
import { Button, StatusPill, type StatusTone } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { BACKEND_BASE } from '@lib/api/client';
import { withCorrelationHeaders } from '@lib/api/correlationHeaders';
import { authService } from '@lib/auth';
import { groupPackInventoryEntries } from '@lib/content/packCategoryGrouping';


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ContentPackInfo / ContentPackInventory are the canonical shapes from
// @pixsim7/shared.api.client/domains (imported above) — don't redeclare them
// here; a local copy silently drifts (e.g. missing the `category` field).

interface PurgeResult {
  packs_purged: number;
  results: Record<string, {
    blocks_purged?: number;
    templates_purged?: number;
    characters_purged?: number;
    error?: string;
  }>;
}

// ---------------------------------------------------------------------------
// API helpers (same pattern as MaintenanceDashboard)
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  const token = authService.getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const res = await fetch(`${BACKEND_BASE}${path}`, {
    method,
    headers: withCorrelationHeaders(authHeaders(), 'settings:content-packs-dashboard'),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
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
// Status badge
// ---------------------------------------------------------------------------

const STATUS_TONES: Record<ContentPackInfo['status'], StatusTone> = {
  active: 'success',
  orphaned: 'danger',
  disk_only: 'neutral',
};

function StatusBadge({ status }: { status: ContentPackInfo['status'] }) {
  return (
    <StatusPill tone={STATUS_TONES[status]} shape="square" size="xs">
      {status === 'disk_only' ? 'disk only' : status}
    </StatusPill>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function ContentPacksDashboard() {
  const [inventory, setInventory] = useState<ContentPackInventory | null>(null);
  const [loading, setLoading] = useState(false);
  const [purging, setPurging] = useState<string | null>(null); // pack name or '__all__'
  const [result, setResult] = useState<{ message: string; isError?: boolean } | null>(null);
  const [confirmPack, setConfirmPack] = useState<string | null>(null); // pack awaiting confirm

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const data = await apiFetch<ContentPackInventory>(
        '/api/v1/block-templates/meta/content-packs/inventory',
      );
      setInventory(data);
    } catch (err: any) {
      setResult({ message: err.message || 'Failed to load inventory', isError: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handlePurge = useCallback(async (pack?: string) => {
    const key = pack ?? '__all__';
    setPurging(key);
    setResult(null);
    setConfirmPack(null);
    try {
      const endpoint = pack
        ? `/api/v1/block-templates/meta/content-packs/purge?pack=${encodeURIComponent(pack)}`
        : '/api/v1/block-templates/meta/content-packs/purge';
      const data = await apiFetch<PurgeResult>(endpoint, 'POST');

      const totalPurged = Object.values(data.results).reduce(
        (sum, r) => sum + (r.blocks_purged ?? 0) + (r.templates_purged ?? 0) + (r.characters_purged ?? 0),
        0,
      );
      const errors = Object.entries(data.results).filter(([, r]) => r.error);

      if (errors.length > 0) {
        setResult({ message: `Purged ${totalPurged} entities, ${errors.length} error(s)`, isError: true });
      } else {
        setResult({ message: `Purged ${totalPurged} entities from ${data.packs_purged} pack(s)` });
      }

      await fetchInventory();
    } catch (err: any) {
      setResult({ message: err.message || 'Purge failed', isError: true });
    } finally {
      setPurging(null);
    }
  }, [fetchInventory]);

  // Hooks must run unconditionally — derive memoized views before any early
  // return. Empty input falls through to the "no packs" branch in render.
  const packEntries = useMemo(
    () => Object.entries(inventory?.packs ?? {}).filter(([, info]) => info.status !== 'disk_only'),
    [inventory],
  );
  const groupedPackEntries = useMemo(
    () => groupPackInventoryEntries(packEntries),
    [packEntries],
  );

  if (!inventory && loading) {
    return (
      <div className="flex items-center gap-2 py-4 px-3">
        <Spinner />
        <span className="text-xs text-muted-foreground">Loading content pack inventory...</span>
      </div>
    );
  }

  if (!inventory) {
    return (
      <div className="py-4 px-3 text-xs text-muted-foreground">
        {result?.message || 'No inventory data'}
      </div>
    );
  }

  const { summary } = inventory;
  const hasOrphans = summary.orphaned_packs > 0;

  return (
    <div className="space-y-0">
      {/* Summary header */}
      <div className="flex items-center gap-3 px-3 py-2 text-[11px] text-muted-foreground">
        <span>
          {summary.total_packs - summary.disk_only_packs} pack{summary.total_packs - summary.disk_only_packs !== 1 ? 's' : ''} in DB
        </span>
        {hasOrphans && (
          <span className="text-red-500 dark:text-red-400 font-medium">
            {summary.orphaned_packs} orphaned ({summary.total_orphaned_entities} stale entit{summary.total_orphaned_entities !== 1 ? 'ies' : 'y'})
          </span>
        )}
        {!hasOrphans && (
          <span className="text-green-600 dark:text-green-400 font-medium">all clean</span>
        )}
      </div>

      <div className="h-px bg-border mx-3" />

      {/* Column headers */}
      <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 select-none">
        <span className="w-[140px] shrink-0">Pack</span>
        <span className="w-[70px] shrink-0">Status</span>
        <span className="w-[50px] shrink-0 text-right tabular-nums">Blocks</span>
        <span className="w-[65px] shrink-0 text-right tabular-nums">Templates</span>
        <span className="w-[70px] shrink-0 text-right tabular-nums">Characters</span>
        <span className="flex-1 min-w-[70px] text-right">Action</span>
      </div>

      <div className="h-px bg-border mx-3" />

      {/* Pack rows, grouped by manifest `category` (canonical order via PACK_CATEGORY_ORDER) */}
      {packEntries.length === 0 ? (
        <div className="py-3 px-3 text-xs text-muted-foreground">No content packs in database</div>
      ) : (
        groupedPackEntries.map((group) => (
          <div key={group.category} data-testid={`pack-category-group-${group.category}`}>
            <div
              className={`flex items-center gap-2 px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider font-semibold select-none ${
                group.isUncategorized
                  ? 'text-muted-foreground/50 italic'
                  : 'text-muted-foreground/75'
              }`}
            >
              <span>{group.label}</span>
              <span className="text-muted-foreground/40 normal-case tracking-normal tabular-nums">
                {group.entries.length}
              </span>
            </div>
            {group.entries.map(([name, info]) => {
              const isOrphaned = info.status === 'orphaned';
              const entityCount = info.blocks + info.templates + info.characters;
              const isPurging = purging === name;
              const isConfirming = confirmPack === name;

              return (
                <div key={name}>
                  <div className={`flex items-center gap-3 py-1.5 px-3 ${isOrphaned ? 'bg-red-50/30 dark:bg-red-950/10' : ''}`}>
                    <span className={`text-xs font-medium w-[140px] shrink-0 truncate ${isOrphaned ? 'text-red-600 dark:text-red-400' : ''}`} title={name}>
                      {name}
                    </span>
                    <span className="w-[70px] shrink-0">
                      <StatusBadge status={info.status} />
                    </span>
                    <span className="w-[50px] shrink-0 text-right text-xs tabular-nums text-muted-foreground">{info.blocks}</span>
                    <span className="w-[65px] shrink-0 text-right text-xs tabular-nums text-muted-foreground">{info.templates}</span>
                    <span className="w-[70px] shrink-0 text-right text-xs tabular-nums text-muted-foreground">{info.characters}</span>
                    <div className="flex-1 min-w-[70px] flex justify-end">
                      {isOrphaned && !isConfirming && (
                        <Button
                          onClick={() => setConfirmPack(name)}
                          disabled={!!purging}
                          variant="outline"
                          size="sm"
                        >
                          Purge {entityCount}
                        </Button>
                      )}
                      {isOrphaned && isConfirming && (
                        <div className="flex items-center gap-1.5">
                          <Button
                            onClick={() => handlePurge(name)}
                            disabled={!!purging}
                            variant="danger"
                            size="sm"
                          >
                            {isPurging ? <Spinner className="w-3 h-3" /> : 'Confirm'}
                          </Button>
                          <Button
                            onClick={() => setConfirmPack(null)}
                            disabled={!!purging}
                            variant="outline"
                            size="sm"
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="h-px bg-border/50 mx-3" />
                </div>
              );
            })}
          </div>
        ))
      )}

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-3 pt-2 pb-1">
        {hasOrphans && (
          <Button
            onClick={() => {
              if (confirmPack === '__all__') {
                handlePurge();
              } else {
                setConfirmPack('__all__');
              }
            }}
            disabled={!!purging}
            variant={confirmPack === '__all__' ? 'danger' : 'outline'}
            size="sm"
          >
            {purging === '__all__' ? (
              <>
                <Spinner className="w-3 h-3" />
                <span className="ml-1.5">Purging...</span>
              </>
            ) : confirmPack === '__all__' ? (
              'Confirm Purge All'
            ) : (
              'Purge All Orphaned'
            )}
          </Button>
        )}
        <Button onClick={fetchInventory} disabled={loading} variant="outline" size="sm">
          {loading ? (
            <>
              <Spinner className="w-3 h-3" />
              <span className="ml-1.5">Refreshing...</span>
            </>
          ) : (
            'Refresh'
          )}
        </Button>
      </div>

      {/* Result message */}
      {result && (
        <div
          className={`flex items-center gap-1.5 text-[11px] px-3 pb-2 ${
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

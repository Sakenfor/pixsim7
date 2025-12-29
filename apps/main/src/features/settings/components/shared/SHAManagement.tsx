/**
 * SHA Hash Management Component
 *
 * Displays stats about SHA256 hash coverage and allows backfilling missing hashes.
 */

import { useState, useEffect } from 'react';
import { Button } from '@pixsim7/shared.ui';
import { authService } from '@lib/auth/authService';

interface SHAStats {
  total_assets: number;
  with_sha: number;
  without_sha: number;
  without_sha_with_local: number;
  without_sha_no_local: number;
  percentage: number;
}

interface BackfillResult {
  success: boolean;
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
}

export function SHAManagement() {
  const [stats, setStats] = useState<SHAStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const token = authService.getStoredToken();

      const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/assets/sha-stats`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch stats: ${res.statusText}`);
      }

      const data: SHAStats = await res.json();
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  const backfillHashes = async () => {
    setBackfilling(true);
    setError(null);
    setResult(null);
    try {
      const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const token = authService.getStoredToken();

      const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/assets/backfill-sha?limit=100`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }

      const data: BackfillResult = await res.json();
      setResult(data);

      // Refresh stats after backfill
      await fetchStats();
    } catch (err: any) {
      setError(err.message || 'Failed to backfill hashes');
    } finally {
      setBackfilling(false);
    }
  };

  // Load stats on mount
  useEffect(() => {
    fetchStats();
  }, []);

  if (loading && !stats) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {error}
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const canBackfill = stats.without_sha_with_local > 0;
  const allHashed = stats.without_sha === 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${allHashed ? 'bg-green-500/10' : 'bg-amber-500/10'}`}>
          <svg className={`w-4 h-4 ${allHashed ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Server Assets</span>
            <span className={`text-xs font-medium ${allHashed ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
              {stats.percentage.toFixed(0)}%
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {stats.with_sha.toLocaleString()} / {stats.total_assets.toLocaleString()} hashed
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full transition-all rounded-full ${allHashed ? 'bg-green-500' : 'bg-amber-500'}`}
          style={{ width: `${stats.percentage}%` }}
        />
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 text-xs">
        {allHashed ? (
          <>
            <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-green-600 dark:text-green-400">All assets have SHA256 hashes</span>
          </>
        ) : canBackfill ? (
          <>
            <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
            </svg>
            <span className="text-muted-foreground">{stats.without_sha_with_local.toLocaleString()} assets can be hashed</span>
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-muted-foreground">Remaining assets are remote-only</span>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {canBackfill && (
          <Button onClick={backfillHashes} disabled={backfilling} variant="default" size="sm">
            {backfilling ? 'Computing...' : `Hash ${Math.min(100, stats.without_sha_with_local)} assets`}
          </Button>
        )}
        <Button onClick={fetchStats} disabled={loading || backfilling} variant="outline" size="sm">
          Refresh
        </Button>
      </div>

      {/* Result */}
      {result && result.updated > 0 && (
        <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-500/10 rounded-md px-2.5 py-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {result.updated} hashes computed{result.skipped > 0 && `, ${result.skipped} skipped`}
        </div>
      )}
    </div>
  );
}

/**
 * SHA Hash Management Component
 *
 * Displays stats about SHA256 hash coverage and allows backfilling missing hashes.
 */

import { useState, useEffect } from 'react';
import { Button } from '@pixsim7/shared.ui';

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
      const token = localStorage.getItem('access_token');

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
      const token = localStorage.getItem('access_token');

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
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  if (error) {
    return <div className="text-sm text-destructive">{error}</div>;
  }

  if (!stats) {
    return null;
  }

  const canBackfill = stats.without_sha_with_local > 0;
  const allHashed = stats.without_sha === 0;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {stats.with_sha} / {stats.total_assets} with hash ({stats.percentage.toFixed(0)}%)
        </span>
        {stats.without_sha_with_local > 0 && (
          <span className="text-orange-600 font-medium">
            {stats.without_sha_with_local} can be hashed
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-green-600 transition-all"
          style={{ width: `${stats.percentage}%` }}
        />
      </div>

      {/* Status */}
      {allHashed ? (
        <div className="text-sm text-green-600 dark:text-green-400">
          ✓ All assets have SHA256 hashes
        </div>
      ) : !canBackfill ? (
        <div className="text-sm text-muted-foreground">
          No hashable assets (remote-only need local files)
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          {stats.without_sha_with_local} assets ready for hashing
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {canBackfill && (
          <Button
            onClick={backfillHashes}
            disabled={backfilling}
            variant="default"
            size="sm"
          >
            {backfilling ? 'Computing...' : `Compute Hashes (${Math.min(100, stats.without_sha_with_local)})`}
          </Button>
        )}
        <Button
          onClick={fetchStats}
          disabled={loading || backfilling}
          variant="outline"
          size="sm"
        >
          Refresh
        </Button>
      </div>

      {/* Result */}
      {result && result.updated > 0 && (
        <div className="text-sm text-green-600 dark:text-green-400">
          ✓ {result.updated} hashes computed
          {result.skipped > 0 && `, ${result.skipped} skipped`}
        </div>
      )}
    </div>
  );
}

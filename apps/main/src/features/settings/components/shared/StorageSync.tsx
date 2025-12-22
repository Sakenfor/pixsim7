/**
 * Storage Sync Component
 *
 * Shows storage system status and allows bulk re-sync to content-addressed storage.
 */

import { useState, useEffect } from 'react';
import { Button } from '@pixsim7/shared.ui';

interface StorageSyncStats {
  total_assets: number;
  new_storage: number;
  old_storage: number;
  no_local: number;
  percentage: number;
}

interface BulkSyncResult {
  success: boolean;
  processed: number;
  synced: number;
  skipped: number;
  errors: number;
}

export function StorageSync() {
  const [stats, setStats] = useState<StorageSyncStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<BulkSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const token = localStorage.getItem('access_token');

      const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/assets/storage-sync-stats`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch stats: ${res.statusText}`);
      }

      const data: StorageSyncStats = await res.json();
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  const syncAssets = async () => {
    setSyncing(true);
    setError(null);
    setResult(null);
    try {
      const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const token = localStorage.getItem('access_token');

      const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/assets/bulk-sync-storage?limit=50`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }

      const data: BulkSyncResult = await res.json();
      setResult(data);

      // Refresh stats after sync
      await fetchStats();
    } catch (err: any) {
      setError(err.message || 'Failed to sync assets');
    } finally {
      setSyncing(false);
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

  const needsSync = stats.old_storage > 0;
  const allOnNewStorage = stats.old_storage === 0 && stats.total_assets > 0;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {stats.new_storage} / {stats.total_assets} on new storage ({stats.percentage.toFixed(0)}%)
        </span>
        {stats.old_storage > 0 && (
          <span className="text-orange-600 font-medium">
            {stats.old_storage} on old system
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all"
          style={{ width: `${stats.percentage}%` }}
        />
      </div>

      {/* Status */}
      {allOnNewStorage ? (
        <div className="text-sm text-green-600 dark:text-green-400">
          ✓ All assets using content-addressed storage
        </div>
      ) : needsSync ? (
        <div className="text-sm text-muted-foreground">
          {stats.old_storage} assets need re-sync from provider
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          New downloads use content-addressed storage automatically
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {needsSync && (
          <Button
            onClick={syncAssets}
            disabled={syncing}
            variant="default"
            size="sm"
          >
            {syncing ? 'Syncing...' : `Re-sync Assets (${Math.min(50, stats.old_storage)})`}
          </Button>
        )}
        <Button
          onClick={fetchStats}
          disabled={loading || syncing}
          variant="outline"
          size="sm"
        >
          Refresh
        </Button>
      </div>

      {/* Result */}
      {result && result.synced > 0 && (
        <div className="text-sm text-green-600 dark:text-green-400">
          {result.synced} assets synced to new storage
          {result.errors > 0 && `, ${result.errors} errors`}
        </div>
      )}
    </div>
  );
}

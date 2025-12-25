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

  const needsSync = stats.old_storage > 0;
  const allOnNewStorage = stats.old_storage === 0 && stats.total_assets > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${allOnNewStorage ? 'bg-green-500/10' : 'bg-blue-500/10'}`}>
          <svg className={`w-4 h-4 ${allOnNewStorage ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Content Storage</span>
            <span className={`text-xs font-medium ${allOnNewStorage ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
              {stats.percentage.toFixed(0)}%
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {stats.new_storage.toLocaleString()} / {stats.total_assets.toLocaleString()} on new storage
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full transition-all rounded-full ${allOnNewStorage ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${stats.percentage}%` }}
        />
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 text-xs">
        {allOnNewStorage ? (
          <>
            <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-green-600 dark:text-green-400">All assets on content-addressed storage</span>
          </>
        ) : needsSync ? (
          <>
            <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-muted-foreground">{stats.old_storage.toLocaleString()} assets need re-sync</span>
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-muted-foreground">New downloads auto-use content storage</span>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {needsSync && (
          <Button onClick={syncAssets} disabled={syncing} variant="default" size="sm">
            {syncing ? 'Syncing...' : `Sync ${Math.min(50, stats.old_storage)} assets`}
          </Button>
        )}
        <Button onClick={fetchStats} disabled={loading || syncing} variant="outline" size="sm">
          Refresh
        </Button>
      </div>

      {/* Result */}
      {result && result.synced > 0 && (
        <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-500/10 rounded-md px-2.5 py-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {result.synced} assets synced{result.errors > 0 && `, ${result.errors} errors`}
        </div>
      )}
    </div>
  );
}

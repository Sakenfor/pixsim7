/**
 * Content Blob Management Component
 *
 * Shows linkage stats for global content blobs and allows backfill.
 */

import { Button } from '@pixsim7/shared.ui';
import { useState, useEffect } from 'react';

import { authService } from '@lib/auth';

interface ContentBlobStats {
  total_assets: number;
  with_content_id: number;
  missing_content_id: number;
  missing_with_sha: number;
  missing_logical_size: number;
  percentage: number;
}

interface BackfillResult {
  success: boolean;
  processed: number;
  linked: number;
  updated_sizes: number;
  skipped: number;
  errors: number;
}

export function ContentBlobManagement() {
  const [stats, setStats] = useState<ContentBlobStats | null>(null);
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

      const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/assets/content-blob-stats`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch stats: ${res.statusText}`);
      }

      const data: ContentBlobStats = await res.json();
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  const backfillLinks = async () => {
    setBackfilling(true);
    setError(null);
    setResult(null);
    try {
      const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const token = authService.getStoredToken();

      const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/assets/backfill-content-blobs?limit=100`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }

      const data: BackfillResult = await res.json();
      setResult(data);

      await fetchStats();
    } catch (err: any) {
      setError(err.message || 'Failed to backfill content links');
    } finally {
      setBackfilling(false);
    }
  };

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

  const canBackfill = stats.missing_with_sha > 0 || stats.missing_logical_size > 0;
  const allLinked = stats.missing_content_id === 0 && stats.missing_logical_size === 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${allLinked ? 'bg-green-500/10' : 'bg-indigo-500/10'}`}>
          <svg className={`w-4 h-4 ${allLinked ? 'text-green-600 dark:text-green-400' : 'text-indigo-600 dark:text-indigo-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Content Links</span>
            <span className={`text-xs font-medium ${allLinked ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
              {stats.percentage.toFixed(0)}%
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {stats.with_content_id.toLocaleString()} / {stats.total_assets.toLocaleString()} linked
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full transition-all rounded-full ${allLinked ? 'bg-green-500' : 'bg-indigo-500'}`}
          style={{ width: `${stats.percentage}%` }}
        />
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 text-xs">
        {allLinked ? (
          <>
            <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-green-600 dark:text-green-400">All assets linked to content blobs</span>
          </>
        ) : canBackfill ? (
          <>
            <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
            </svg>
            <span className="text-muted-foreground">
              {stats.missing_with_sha > 0 && `${stats.missing_with_sha.toLocaleString()} linkable`}
              {stats.missing_with_sha > 0 && stats.missing_logical_size > 0 && ', '}
              {stats.missing_logical_size > 0 && `${stats.missing_logical_size.toLocaleString()} need size`}
            </span>
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-muted-foreground">Remaining need SHA hashes first</span>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {canBackfill && (
          <Button onClick={backfillLinks} disabled={backfilling} variant="primary" size="sm">
            {backfilling ? 'Linking...' : `Link ${Math.min(100, stats.missing_with_sha + stats.missing_logical_size)} assets`}
          </Button>
        )}
        <Button onClick={fetchStats} disabled={loading || backfilling} variant="outline" size="sm">
          Refresh
        </Button>
      </div>

      {/* Result */}
      {result && (result.linked > 0 || result.updated_sizes > 0) && (
        <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-500/10 rounded-md px-2.5 py-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {result.linked > 0 && `${result.linked} linked`}
          {result.linked > 0 && result.updated_sizes > 0 && ', '}
          {result.updated_sizes > 0 && `${result.updated_sizes} sizes updated`}
          {result.errors > 0 && `, ${result.errors} errors`}
        </div>
      )}
    </div>
  );
}

/**
 * Library Sync Section
 *
 * Provider library sync tools for scanning, importing, and rebuilding lineage.
 * Supports all providers that have sync capabilities (currently Pixverse).
 */
import { useState, useEffect, useMemo } from 'react';
import { Button, useToast } from '@pixsim7/shared.ui';
import { useProviders } from '@features/providers/hooks/useProviders';
import { useProviderCapacity, type ProviderAccount } from '@features/providers/hooks/useProviderAccounts';
import {
  getPixverseSyncDryRun,
  syncPixverseAssets,
  refreshAssetLineage,
  type SyncDryRunResponse,
} from '@features/providers/lib/api/pixverseSync';

// Providers that support library sync
const SYNC_CAPABLE_PROVIDERS = ['pixverse'];

export function LibrarySyncSection() {
  const toast = useToast();
  const { providers, loading: providersLoading } = useProviders();
  const [refreshKey, setRefreshKey] = useState(0);
  const { capacity, loading: accountsLoading, accounts } = useProviderCapacity(refreshKey);

  // Filter to sync-capable providers
  const syncableProviders = useMemo(() => {
    return providers.filter(p => SYNC_CAPABLE_PROVIDERS.includes(p.id));
  }, [providers]);

  // Selected provider
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  // Auto-select first syncable provider
  useEffect(() => {
    if (!selectedProviderId && syncableProviders.length > 0) {
      setSelectedProviderId(syncableProviders[0].id);
    }
  }, [syncableProviders, selectedProviderId]);

  // Get accounts for selected provider
  const providerAccounts = useMemo(() => {
    if (!selectedProviderId) return [];
    const cap = capacity.find(c => c.provider_id === selectedProviderId);
    return cap?.accounts ?? [];
  }, [capacity, selectedProviderId]);

  const loading = providersLoading || accountsLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-sm text-neutral-500">Loading providers...</span>
      </div>
    );
  }

  if (syncableProviders.length === 0) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
            No sync-capable providers found.
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-500">
            Add a Pixverse account to enable library sync.
          </div>
        </div>
      </div>
    );
  }

  const selectedProvider = syncableProviders.find(p => p.id === selectedProviderId);

  return (
    <div className="p-6">
      <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-2">
        Provider Library Sync
      </h3>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
        Scan and import assets from your provider accounts. These tools help you
        sync your remote library with local assets and rebuild lineage data.
      </p>

      {/* Provider tabs */}
      {syncableProviders.length > 1 && (
        <div className="flex gap-2 mb-6">
          {syncableProviders.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedProviderId(p.id)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                selectedProviderId === p.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Provider sync content */}
      {selectedProviderId && selectedProvider && (
        <ProviderSyncContent
          providerId={selectedProviderId}
          providerName={selectedProvider.name}
          accounts={providerAccounts}
          onRefresh={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Provider Sync Content (per-provider)
// ============================================================================

interface ProviderSyncContentProps {
  providerId: string;
  providerName: string;
  accounts: ProviderAccount[];
  onRefresh: () => void;
}

function ProviderSyncContent({ providerId, providerName, accounts, onRefresh }: ProviderSyncContentProps) {
  const toast = useToast();
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    accounts[0]?.id ?? null
  );

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<SyncDryRunResponse | null>(null);

  // Import state
  const [importing, setImporting] = useState(false);

  // Lineage rebuild state
  const [rebuilding, setRebuilding] = useState(false);

  // Keep selectedAccountId in sync with available accounts
  useEffect(() => {
    if (selectedAccountId === null && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
    } else if (accounts.length > 0 && !accounts.find(a => a.id === selectedAccountId)) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  const handleScanLibrary = async () => {
    if (!selectedAccountId) return;

    setScanning(true);
    try {
      const result = await getPixverseSyncDryRun(selectedAccountId, {
        limit: 200,
        includeImages: true,
      });
      setScanResult(result);
      toast.success('Library scan complete');
    } catch (error) {
      console.error('Scan failed:', error);
      toast.error(`Scan failed: ${error}`);
    } finally {
      setScanning(false);
    }
  };

  const handleImportMissing = async () => {
    if (!selectedAccountId) return;

    setImporting(true);
    try {
      const result = await syncPixverseAssets(selectedAccountId, {
        mode: 'both',
        limit: 200,
      });

      const totalCreated = result.videos.created + result.images.created;
      toast.success(`Imported ${result.videos.created} videos, ${result.images.created} images`);

      // Refresh scan results and accounts
      if (totalCreated > 0) {
        await handleScanLibrary();
        onRefresh();
      }
    } catch (error) {
      console.error('Import failed:', error);
      toast.error(`Import failed: ${error}`);
    } finally {
      setImporting(false);
    }
  };

  const handleRebuildLineage = async () => {
    setRebuilding(true);
    try {
      const result = await refreshAssetLineage({
        providerId,
        clearExisting: true,
      });

      const totalNewEdges = result.results.reduce((sum, r) => sum + r.new_edges, 0);
      toast.success(`Rebuilt lineage for ${result.count} assets (${totalNewEdges} edges created)`);
    } catch (error) {
      console.error('Lineage rebuild failed:', error);
      toast.error(`Lineage rebuild failed: ${error}`);
    } finally {
      setRebuilding(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
          No {providerName} accounts found.
        </div>
        <div className="text-xs text-neutral-500 dark:text-neutral-500">
          Add accounts in the Providers settings to enable library sync.
        </div>
      </div>
    );
  }

  const missingVideos = scanResult
    ? scanResult.videos.total_remote - scanResult.videos.existing_count
    : 0;
  const missingImages = scanResult?.images
    ? scanResult.images.total_remote - scanResult.images.existing_count
    : 0;

  return (
    <div className="space-y-6">
      {/* Account selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Account:
        </label>
        <select
          value={selectedAccountId ?? ''}
          onChange={(e) => setSelectedAccountId(Number(e.target.value))}
          className="px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
        >
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.nickname || acc.email}
            </option>
          ))}
        </select>
      </div>

      {/* Scan Results */}
      {scanResult && (
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Videos</div>
            <div className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
              {scanResult.videos.existing_count} / {scanResult.videos.total_remote}
            </div>
            <div className="text-xs text-neutral-500">
              {missingVideos > 0 ? `${missingVideos} missing` : 'All imported'}
            </div>
          </div>
          {scanResult.images && (
            <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Images</div>
              <div className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
                {scanResult.images.existing_count} / {scanResult.images.total_remote}
              </div>
              <div className="text-xs text-neutral-500">
                {missingImages > 0 ? `${missingImages} missing` : 'All imported'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleScanLibrary}
          disabled={scanning || !selectedAccountId}
        >
          {scanning ? 'Scanning...' : 'Scan Library'}
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={handleImportMissing}
          disabled={importing || !selectedAccountId || (scanResult && missingVideos + missingImages === 0)}
        >
          {importing ? 'Importing...' : 'Import Missing Assets'}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleRebuildLineage}
          disabled={rebuilding}
        >
          {rebuilding ? 'Rebuilding...' : 'Rebuild Lineage'}
        </Button>
      </div>

      {/* Help text */}
      <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-xs text-neutral-600 dark:text-neutral-400">
        <strong>Scan Library:</strong> Check how many remote items are already imported.{' '}
        <strong>Import Missing:</strong> Create Asset records for unimported items.{' '}
        <strong>Rebuild Lineage:</strong> Re-extract parent-child relationships from stored metadata.
      </div>
    </div>
  );
}

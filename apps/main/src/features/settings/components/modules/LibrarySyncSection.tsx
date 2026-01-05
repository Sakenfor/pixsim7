/**
 * Library Sync Section
 *
 * Provider library sync tools for scanning, importing, and rebuilding lineage.
 * Supports all providers that have sync capabilities (currently Pixverse).
 */
/* eslint-disable import/no-unresolved */
import { useProviderCapacity, type ProviderAccount } from '@features/providers/hooks/useProviderAccounts';
import { useProviders } from '@features/providers/hooks/useProviders';
import {
  getPixverseSyncDryRun,
  syncPixverseAssets,
  refreshAssetLineage,
  type SyncDryRunResponse,
  type SyncDryRunItem,
} from '@features/providers/lib/api/pixverseSync';
import { Button, useToast } from '@pixsim7/shared.ui';
import { useState, useEffect, useMemo } from 'react';
/* eslint-enable import/no-unresolved */

// ============================================================================
// Scan Details Modal
// ============================================================================

interface ScanDetailsModalProps {
  scanResult: SyncDryRunResponse;
  onClose: () => void;
}

function ScanDetailsModal({ scanResult, onClose }: ScanDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<'videos' | 'images'>('videos');
  const [filter, setFilter] = useState<'all' | 'missing' | 'imported'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const items = activeTab === 'videos' ? scanResult.videos.items : (scanResult.images?.items ?? []);

  const filteredItems = items.filter(item => {
    if (filter === 'all') return true;
    if (filter === 'missing') return !item.already_imported;
    if (filter === 'imported') return item.already_imported;
    return true;
  });

  const handleCopyJson = (item: SyncDryRunItem) => {
    const id = item.video_id || item.image_id || 'unknown';
    navigator.clipboard.writeText(JSON.stringify(item.raw, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAll = () => {
    navigator.clipboard.writeText(JSON.stringify(scanResult, null, 2));
    setCopiedId('all');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePrintToConsole = () => {
    console.group('🔍 Sync Dry Run Results');
    console.log('Provider:', scanResult.provider_id);
    console.log('Account ID:', scanResult.account_id);
    console.log('Limit:', scanResult.limit, 'Offset:', scanResult.offset);
    console.group('Videos');
    console.log('Total Remote:', scanResult.videos.total_remote);
    console.log('Already Imported:', scanResult.videos.existing_count);
    console.log('Missing:', scanResult.videos.total_remote - scanResult.videos.existing_count);
    console.table(scanResult.videos.items.map(i => ({
      id: i.video_id,
      imported: i.already_imported,
      prompt: i.raw?.prompt?.substring(0, 50) + '...',
    })));
    console.groupEnd();
    if (scanResult.images) {
      console.group('Images');
      console.log('Total Remote:', scanResult.images.total_remote);
      console.log('Already Imported:', scanResult.images.existing_count);
      console.log('Missing:', scanResult.images.total_remote - scanResult.images.existing_count);
      console.table(scanResult.images.items.map(i => ({
        id: i.image_id,
        imported: i.already_imported,
        prompt: i.raw?.prompt?.substring(0, 50) + '...',
      })));
      console.groupEnd();
    }
    console.log('Full Data:', scanResult);
    console.groupEnd();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl w-[800px] max-w-[90vw] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            Scan Results Details
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintToConsole}
              className="px-2 py-1 text-[10px] rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300"
              title="Print to browser console (F12)"
            >
              📋 Console
            </button>
            <button
              onClick={handleCopyAll}
              className="px-2 py-1 text-[10px] rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300"
            >
              {copiedId === 'all' ? '✓ Copied!' : '📄 Copy All JSON'}
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded"
            >
              <span className="text-lg leading-none">&times;</span>
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700">
          <div className="grid grid-cols-4 gap-4 text-xs">
            <div>
              <div className="text-neutral-500 dark:text-neutral-400">Provider</div>
              <div className="font-medium text-neutral-800 dark:text-neutral-100">{scanResult.provider_id}</div>
            </div>
            <div>
              <div className="text-neutral-500 dark:text-neutral-400">Videos</div>
              <div className="font-medium text-neutral-800 dark:text-neutral-100">
                {scanResult.videos.existing_count}/{scanResult.videos.total_remote}
                <span className="text-neutral-500 ml-1">
                  ({scanResult.videos.total_remote - scanResult.videos.existing_count} missing)
                </span>
              </div>
            </div>
            {scanResult.images && (
              <div>
                <div className="text-neutral-500 dark:text-neutral-400">Images</div>
                <div className="font-medium text-neutral-800 dark:text-neutral-100">
                  {scanResult.images.existing_count}/{scanResult.images.total_remote}
                  <span className="text-neutral-500 ml-1">
                    ({scanResult.images.total_remote - scanResult.images.existing_count} missing)
                  </span>
                </div>
              </div>
            )}
            <div>
              <div className="text-neutral-500 dark:text-neutral-400">Scanned</div>
              <div className="font-medium text-neutral-800 dark:text-neutral-100">
                {scanResult.limit} items (offset {scanResult.offset})
              </div>
            </div>
          </div>
        </div>

        {/* Tabs & Filter */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('videos')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                activeTab === 'videos'
                  ? 'bg-blue-500 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              Videos ({scanResult.videos.items.length})
            </button>
            {scanResult.images && (
              <button
                onClick={() => setActiveTab('images')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  activeTab === 'images'
                    ? 'bg-blue-500 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                Images ({scanResult.images.items.length})
              </button>
            )}
          </div>
          <div className="flex gap-1">
            {(['all', 'missing', 'imported'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-1 text-[10px] rounded transition-colors ${
                  filter === f
                    ? 'bg-neutral-700 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                }`}
              >
                {f === 'all' ? 'All' : f === 'missing' ? 'Missing' : 'Imported'}
              </button>
            ))}
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="text-center py-8 text-sm text-neutral-500">
              No items match the current filter.
            </div>
          ) : (
            <div className="space-y-1">
              {filteredItems.map((item, idx) => {
                const id = item.video_id || item.image_id || `item-${idx}`;
                const prompt = item.raw?.prompt || item.raw?.description || '';
                // Check all possible thumbnail fields from Pixverse API
                const thumbnail =
                  item.raw?.customer_video_last_frame_url ||
                  item.raw?.first_frame ||
                  item.raw?.thumbnail ||
                  item.raw?.cover ||
                  item.raw?.cover_url ||
                  item.raw?.image_url ||
                  item.raw?.img_url ||
                  item.raw?.url;
                const createdAt = item.raw?.created_at || item.raw?.create_time;

                return (
                  <div
                    key={id}
                    className={`flex items-start gap-3 p-2 rounded border ${
                      item.already_imported
                        ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/20'
                        : 'border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/20'
                    }`}
                  >
                    {/* Thumbnail */}
                    {thumbnail ? (
                      <img
                        src={thumbnail}
                        alt=""
                        className="w-16 h-16 object-cover rounded flex-shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded flex-shrink-0 bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center">
                        <span className="text-[9px] text-neutral-400 dark:text-neutral-500">No thumb</span>
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400">
                          {id}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                          item.already_imported
                            ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                            : 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400'
                        }`}>
                          {item.already_imported ? 'Imported' : 'Missing'}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-700 dark:text-neutral-300 mt-0.5 line-clamp-2">
                        {prompt || <span className="italic text-neutral-400">No prompt</span>}
                      </div>
                      {createdAt && (
                        <div className="text-[9px] text-neutral-500 mt-0.5">
                          Created: {new Date(createdAt).toLocaleString()}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <button
                      onClick={() => handleCopyJson(item)}
                      className="flex-shrink-0 px-2 py-1 text-[9px] rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400"
                    >
                      {copiedId === id ? '✓' : 'JSON'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Providers that support library sync
const SYNC_CAPABLE_PROVIDERS = ['pixverse'];

export function LibrarySyncSection() {
  const { providers, loading: providersLoading } = useProviders();
  const [refreshKey, setRefreshKey] = useState(0);
  const { capacity, loading: accountsLoading } = useProviderCapacity(refreshKey);

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
  const [showDetails, setShowDetails] = useState(false);

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
        <div className="space-y-3">
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
          <button
            onClick={() => setShowDetails(true)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Show Details ({scanResult.videos.items.length + (scanResult.images?.items.length ?? 0)} items scanned)
          </button>
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

      {/* Details Modal */}
      {showDetails && scanResult && (
        <ScanDetailsModal
          scanResult={scanResult}
          onClose={() => setShowDetails(false)}
        />
      )}
    </div>
  );
}

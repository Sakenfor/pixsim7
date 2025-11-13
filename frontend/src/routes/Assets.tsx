import { useState, useEffect } from 'react';
import { useAssets } from '../hooks/useAssets';
import { useProviders } from '../hooks/useProviders';
import { MediaCard } from '../components/media/MediaCard';
import { useJobsSocket } from '../hooks/useJobsSocket';
import { Tabs } from '../components/navigation/Tabs';
import { Badge } from '@pixsim7/ui';
import { MasonryGrid } from '../components/layout/MasonryGrid';
import { LocalFoldersPanel } from '../components/assets/LocalFoldersPanel';

const SCOPE_TABS = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'mine', label: 'Mine' },
  { id: 'recent', label: 'Recent' },
];

export function AssetsRoute() {
  // Filters state derived from URL + sessionStorage
  const params = new URLSearchParams(window.location.search);
  const sessionKey = 'assets_filters';
  const persisted = (() => {
    try { return JSON.parse(sessionStorage.getItem(sessionKey) || '{}'); } catch { return {}; }
  })();
  const initialFilters = {
    q: params.get('q') || persisted.q || '',
    tag: params.get('tag') || persisted.tag || undefined,
    provider_id: params.get('provider_id') || persisted.provider_id || undefined,
    sort: (params.get('sort') as any) || persisted.sort || 'new',
  };
  const [filters, setFilters] = useState(initialFilters);
  const { providers } = useProviders();
  const { items, loadMore, loading, error, hasMore } = useAssets({ filters });
  const jobsSocket = useJobsSocket({ autoConnect: true });

  function updateURL(next: typeof filters) {
    const p = new URLSearchParams();
    if (next.q) p.set('q', next.q);
    if (next.tag) p.set('tag', next.tag);
    if (next.provider_id) p.set('provider_id', next.provider_id);
    if (next.sort) p.set('sort', next.sort);
    const newUrl = `${window.location.pathname}?${p.toString()}`;
    window.history.replaceState({}, '', newUrl);
    sessionStorage.setItem(sessionKey, JSON.stringify(next));
  }

  function setAndPersist(partial: Partial<typeof filters>) {
    setFilters(prev => {
      const next = { ...prev, ...partial };
      updateURL(next);
      return next;
    });
  }

  // Read scope from URL on mount
  const [scope, setScope] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('scope') || 'all';
  });

  // Sync scope to URL when it changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (scope === 'all') {
      params.delete('scope');
    } else {
      params.set('scope', scope);
    }
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [scope]);

  const handleScopeChange = (newScope: string) => {
    setScope(newScope);
  };

  const currentTab = SCOPE_TABS.find(t => t.id === scope);
  // View toggle between remote assets and local folders panel
  const [view, setView] = useState<'remote' | 'local'>('remote');

  return (
    <div className="p-6 space-y-4 content-with-dock min-h-screen">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Assets</h1>
        <div className="flex items-center gap-4">
          <div className="flex gap-1 text-xs">
            <button
              className={`px-2 py-1 rounded ${view==='remote' ? 'bg-blue-600 text-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}
              onClick={() => setView('remote')}
            >Remote</button>
            <button
              className={`px-2 py-1 rounded ${view==='local' ? 'bg-blue-600 text-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}
              onClick={() => setView('local')}
            >Local</button>
          </div>
          <div className="text-xs text-neutral-500">
            Jobs WS: {jobsSocket.connected ? 'connected' : 'disconnected'}
          </div>
        </div>
      </div>

      {view === 'remote' && (
        <>
          <Tabs tabs={SCOPE_TABS} value={scope} onChange={handleScopeChange} />
          {currentTab && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-600">Viewing:</span>
              <Badge color="blue">{currentTab.label}</Badge>
            </div>
          )}
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <div className="space-y-2 bg-neutral-50 dark:bg-neutral-800 p-3 rounded border border-neutral-200 dark:border-neutral-700">
            <div className="flex flex-wrap gap-2 items-center">
              <input
                placeholder="Search..."
                className="px-2 py-1 text-sm border rounded"
                value={filters.q}
                onChange={(e) => setAndPersist({ q: e.target.value })}
              />
              <select
                className="px-2 py-1 text-sm border rounded"
                value={filters.provider_id || ''}
                onChange={(e) => setAndPersist({ provider_id: e.target.value || undefined })}
              >
                <option value="">All Providers</option>
                {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select
                className="px-2 py-1 text-sm border rounded"
                value={filters.sort}
                onChange={(e) => setAndPersist({ sort: e.target.value as any })}
              >
                <option value="new">Newest</option>
                <option value="old">Oldest</option>
                <option value="alpha">A–Z</option>
              </select>
            </div>
          </div>
          <MasonryGrid
            items={items.map(a => (
              <div key={a.id} className="break-inside-avoid rounded overflow-hidden inline-block w-full">
                <MediaCard
                  id={a.id}
                  mediaType={a.media_type}
                  providerId={a.provider_id}
                  providerAssetId={a.provider_asset_id}
                  thumbUrl={a.thumbnail_url}
                  remoteUrl={a.remote_url}
                  width={a.width}
                  height={a.height}
                  durationSec={a.duration_sec}
                  tags={a.tags}
                  description={a.description}
                  createdAt={a.created_at}
                  status={a.sync_status}
                />
              </div>
            ))}
          />
          <div className="pt-4">
            {hasMore && (
              <button disabled={loading} onClick={loadMore} className="border px-4 py-2 rounded">
                {loading ? 'Loading...' : 'Load More'}
              </button>
            )}
            {!hasMore && <div className="text-sm text-neutral-500">No more assets</div>}
          </div>
        </>
      )}
      {view === 'local' && <LocalFoldersPanel />}
    </div>
  );
}
